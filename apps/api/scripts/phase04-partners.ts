import assert from "node:assert/strict";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import pg from "pg";
import { verifyChild, CHILD } from "./isolated-dev-guard";

const mode = process.argv[2];
const targets = [
  { id: "cmv30km8f00011seontkarqbd", name: "Mahmoud Al-Haj", role: "Sales", market: "JO", accountType: "PARTNER" },
  { id: "cmt4z6zfq000xxcx4r04xj809", name: "Ahmad Nazzal", role: "Admin", market: "OTHER", accountType: "INTERNAL" },
] as const;
const migration = "20261114120000_partner_market_defaults";
const migrationPath = new URL(`../prisma/migrations/${migration}/migration.sql`, import.meta.url);
const checksum = () => createHash("sha256").update(readFileSync(migrationPath)).digest("hex");
const planPath = join(homedir(), "AppData/Local/NBS/CRM-lite-isolated/phase04-partner-plan.json");
const ids = targets.map(target => target.id);
const c = new pg.Client({ connectionString: process.env.DIRECT_URL, connectionTimeoutMillis: 15000, query_timeout: 15000 });
async function identity() {
  const row = (await c.query("SELECT current_database() AS database,current_setting('neon.project_id',true) AS project,current_setting('neon.branch_id',true) AS branch,current_setting('neon.endpoint_id',true) AS endpoint")).rows[0];
  assert.deepEqual(row, CHILD);
}
async function accounts() {
  return (await c.query('SELECT u.id,u.name,u."isActive",r.name AS role,r."isSystem",ARRAY(SELECT "marketCode" FROM user_sales_markets m WHERE m."userId"=u.id ORDER BY 1) AS markets FROM users u JOIN roles r ON r.id=u."roleId" WHERE u.id=ANY($1::text[]) ORDER BY u.id', [ids])).rows;
}
async function baseline(cutoff: string) {
  const result: Record<string, string> = {};
  for (const table of ["companies", "contacts", "opportunities", "activities", "tasks", "research_evidence", "hypotheses", "recruitment_candidates", "sessions", "roles", "permissions", "role_permissions", "sales_markets", "notifications", "ownership_requests"]) {
    result[table] = (await c.query(`SELECT md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]')) AS digest FROM "${table}" t`)).rows[0].digest;
  }
  result.users = (await c.query(`SELECT md5(COALESCE(jsonb_agg(CASE WHEN id=ANY($1::text[]) THEN to_jsonb(t)-'{accountType,defaultMarketCode,updatedAt}'::text[] ELSE to_jsonb(t)-'{accountType,defaultMarketCode}'::text[] END ORDER BY id)::text,'[]')) AS digest FROM users t`, [ids])).rows[0].digest;
  result.otherMemberships = (await c.query('SELECT md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,\'[]\')) AS digest FROM user_sales_markets t WHERE NOT ("userId"=ANY($1::text[]))', [ids])).rows[0].digest;
  result.auditHistory = (await c.query('SELECT md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY id)::text,\'[]\')) AS digest FROM audit_logs t WHERE "createdAt" <= $1::timestamp', [cutoff])).rows[0].digest;
  return result;
}
try {
  assert.ok(mode === "check" || mode === "apply");
  const runtime = await verifyChild(process.env.DATABASE_URL!); await verifyChild(process.env.DIRECT_URL!);
  await c.connect(); await identity();
  await c.query("BEGIN"); await c.query("SET LOCAL lock_timeout='5s'"); await c.query("SET LOCAL statement_timeout='15s'");
  if (mode === "check") await c.query("SET TRANSACTION READ ONLY");
  const rows = await accounts(); assert.equal(rows.length, 2);
  for (const target of targets) { const row = rows.find(row => row.id === target.id)!; assert.equal(row.name, target.name); assert.equal(row.role, target.role); assert.equal(row.isActive, true); assert.equal(row.isSystem, true); }
  const markets = (await c.query("SELECT code FROM sales_markets WHERE code IN ('JO','OTHER')")).rows; assert.equal(markets.length, 2);
  if (mode === "check") {
    const cutoff = new Date().toISOString(); const plan = { target: runtime.branch, targets, migration, checksum: checksum(), accounts: rows, cutoff, baseline: await baseline(cutoff) };
    writeFileSync(planPath, JSON.stringify(plan));
    console.log(JSON.stringify({ mode: "review (read-only)", branch: runtime.branch, targetFingerprint: runtime.fingerprint, migration, checksum: plan.checksum, accounts: rows, changes: targets.map(target => ({ id: target.id, name: target.name, marketCodes: [target.market], defaultMarketCode: target.market, accountType: target.accountType })), otherRecords: "must match protected baseline", planStoredOutsideRepository: true }, null, 2));
  } else {
    assert.ok(existsSync(planPath)); const plan = JSON.parse(readFileSync(planPath, "utf8"));
    assert.equal(plan.target, CHILD.branch); assert.deepEqual(plan.targets, targets); assert.equal(plan.checksum, checksum());
    assert.deepEqual(await baseline(plan.cutoff), plan.baseline);
    const applied = (await c.query("SELECT checksum FROM _prisma_migrations WHERE migration_name=$1 AND finished_at IS NOT NULL AND rolled_back_at IS NULL", [migration])).rows;
    assert.equal(applied.length, 1); assert.equal(applied[0].checksum, checksum());
    await c.query('SELECT id FROM users WHERE id=ANY($1::text[]) ORDER BY id FOR UPDATE', [ids]);
    const current = (await c.query('SELECT id,"accountType","defaultMarketCode" FROM users WHERE id=ANY($1::text[])', [ids])).rows;
    const ready = targets.every(target => current.some(row => row.id === target.id && row.accountType === target.accountType && row.defaultMarketCode === target.market) && rows.find(row => row.id === target.id).markets.join() === target.market);
    if (!ready) {
      assert.deepEqual(rows, plan.accounts);
      assert.ok((await c.query('SELECT 1 FROM role_permissions rp JOIN roles r ON r.id=rp."roleId" JOIN permissions p ON p.id=rp."permissionId" WHERE r.name=\'Admin\' AND r."isSystem"=true AND p.key=\'markets.manage_memberships\'')).rowCount);
      for (const target of targets) {
        await identity(); await c.query('UPDATE users SET "accountType"=$2::"UserAccountType","defaultMarketCode"=$3,"updatedAt"=now() WHERE id=$1', [target.id, target.accountType, target.market]);
        await identity(); await c.query('DELETE FROM user_sales_markets WHERE "userId"=$1 AND "marketCode"<>$2', [target.id, target.market]);
        await identity(); await c.query('INSERT INTO user_sales_markets ("userId","marketCode","assignedByUserId") VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [target.id, target.market, targets[1].id]);
        await identity(); await c.query('INSERT INTO audit_logs (id,"actorUserId",action,"entityType","entityId","entityLabel",metadata) VALUES ($1,$2,\'USER_MARKETS_CHANGED\',\'USER\',$3,$4,$5::jsonb)', [randomUUID(), targets[1].id, target.id, target.name, JSON.stringify({ before: rows.find(row => row.id === target.id).markets, after: [target.market], defaultMarketCode: target.market, accountType: target.accountType, operation: "Phase 04A approved account defaults" })]);
      }
    }
    assert.deepEqual(await baseline(plan.cutoff), plan.baseline);
    await identity();
    console.log(JSON.stringify({ mode: ready ? "already applied" : "apply", branch: CHILD.branch, updatedAccounts: ready ? 0 : 2, assignments: (await accounts()).map(row => ({ id: row.id, name: row.name, marketCodes: row.markets })), integrity: "all baseline records, ownership, credentials, sessions and history preserved" }, null, 2));
  }
  await c.query("COMMIT");
} catch { await c.query("ROLLBACK").catch(() => {}); console.error("Phase 04A operation blocked; target, account identity, migration or integrity mismatch. No partial transaction committed. Credentials suppressed."); process.exitCode = 1; }
finally { await c.end(); }
