// Target-specific operator. No caller-supplied IDs, URLs, books or SQL are accepted.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { CHILD, verifyChild } from "./isolated-dev-guard";
const admin = "cmt4z6zfq000xxcx4r04xj809";
const partner = "cmv30km8f00011seontkarqbd";
const targets = [
  { id: admin, name: "Ahmad Nazzal", role: "Admin", roleId: "cmt4z6x2z000vxcx451xumuy2", books: ["JO", "US", "UK"], defaultBookId: "US" },
  { id: partner, name: "Mahmoud Al-Haj", role: "Sales", roleId: "cmt4z6x7l000wxcx4rjz113pf", books: ["JO"], defaultBookId: "JO" },
];
const file = join(homedir(), "AppData/Local/NBS/CRM-lite-isolated/phase05-activation-plan.json");
const mode = process.argv[2] ?? "";
const c = new pg.Client({ connectionString: process.env.DIRECT_URL, connectionTimeoutMillis: 15000 });
async function identity() {
  assert.deepEqual((await c.query("SELECT current_database() AS database,current_setting('neon.project_id',true) AS project,current_setting('neon.branch_id',true) AS branch,current_setting('neon.endpoint_id',true) AS endpoint")).rows[0], CHILD);
}
async function accounts() {
  const rows = (await c.query('SELECT u.id,u.name,u."isActive",u."roleId",r.name AS role,r."isSystem",(SELECT count(*)::int FROM users x WHERE x."roleId"=r.id) AS "roleUsers" FROM users u JOIN roles r ON r.id=u."roleId" WHERE u.id=ANY($1::text[]) ORDER BY u.id', [targets.map(t => t.id)])).rows;
  assert.equal(rows.length, 2);
  for (const t of targets) { const r = rows.find(r => r.id === t.id); assert.equal(r.name, t.name); assert.equal(r.role, t.role); assert.equal(r.roleId, t.roleId); assert.equal(r.isSystem, true); assert.equal(r.isActive, true); assert.equal(r.roleUsers, 1); }
  return rows;
}
async function baseline(cutoff: string) {
  const result: Record<string, string> = {};
  for (const table of ["companies", "contacts", "opportunities", "tasks", "activities", "research_evidence", "hypotheses", "recruitment_candidates", "users", "roles", "sales_markets", "user_sales_markets", "notifications", "ownership_requests", "pricing_estimates"]) {
    result[table] = (await c.query(`SELECT md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]')) AS digest FROM "${table}" t`)).rows[0].digest;
  }
  result.sessions = (await c.query('SELECT md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,\'[]\')) AS digest FROM sessions t WHERE "createdAt"<=$1::timestamp', [cutoff])).rows[0].digest;
  result.permissions = (await c.query("SELECT md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY id)::text,'[]')) AS digest FROM permissions t WHERE key<>'pricing.pricebooks.manage'")).rows[0].digest;
  result.roleGrants = (await c.query(`SELECT md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]')) AS digest FROM role_permissions t JOIN permissions p ON p.id=t."permissionId" WHERE NOT ((t."roleId"=$1 AND p.key='pricing.pricebooks.manage') OR (t."roleId"=$2 AND p.key IN ('pricing.view','pricing.estimates.create')))`, [targets[0]!.roleId, targets[1]!.roleId])).rows[0].digest;
  result.audits = (await c.query('SELECT md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY id)::text,\'[]\')) AS digest FROM audit_logs t WHERE "createdAt"<=$1::timestamp', [cutoff])).rows[0].digest;
  return result;
}
async function profiles() {
  return { grants: (await c.query('SELECT "userId","bookId" FROM user_price_book_grants ORDER BY 1,2')).rows, defaults: (await c.query('SELECT * FROM user_pricing_preferences ORDER BY "userId"')).rows };
}
try {
  assert.ok(["check", "apply", "verify"].includes(mode));
  await verifyChild(process.env.DATABASE_URL!); await verifyChild(process.env.DIRECT_URL!);
  await c.connect(); await identity(); await c.query("BEGIN"); await c.query("SET LOCAL lock_timeout='5s'"); await c.query("SET LOCAL statement_timeout='20s'");
  if (mode !== "apply") await c.query("SET TRANSACTION READ ONLY");
  const rows = await accounts();
  if (mode === "check") {
    // This operation is run with both local writers paused, before migration/provisioning.
    const cutoff = new Date().toISOString();
    const counts = (await c.query('SELECT (SELECT count(*)::int FROM companies) AS companies,(SELECT count(*)::int FROM companies WHERE "ownerId" IS NOT NULL) AS owned,(SELECT count(*)::int FROM contacts) AS contacts,(SELECT count(*)::int FROM opportunities) AS opportunities,(SELECT count(*)::int FROM pricing_estimates) AS estimates')).rows[0];
    writeFileSync(file, JSON.stringify({ branch: CHILD.branch, cutoff, targets, baseline: await baseline(cutoff), counts }));
    console.log(JSON.stringify({ mode, branch: CHILD.branch, accounts: rows, approvedProfiles: targets, counts, protectedBaselineStoredOutsideRepository: true }));
  } else {
    const plan = JSON.parse(readFileSync(file, "utf8")); assert.equal(plan.branch, CHILD.branch); assert.deepEqual(plan.targets, targets);
    const observed = await baseline(plan.cutoff);
    const changed = Object.keys(observed).filter(key => observed[key] !== plan.baseline[key]);
    if (changed.length) console.error(JSON.stringify({ protectedBaselineDifferences: changed }));
    assert.deepEqual(observed, plan.baseline);
    const applied = (await c.query("SELECT migration_name FROM _prisma_migrations WHERE migration_name='20261114180000_market_price_books' AND finished_at IS NOT NULL AND rolled_back_at IS NULL")).rows; assert.equal(applied.length, 1);
    const before = await profiles();
    assert.ok(before.grants.every(r => targets.some(t => t.id === r.userId && t.books.includes(r.bookId))));
    assert.ok(before.defaults.every(r => targets.some(t => t.id === r.userId && t.defaultBookId === r.defaultBookId)));
    if (mode === "apply") {
      await c.query('SELECT id FROM users WHERE id=ANY($1::text[]) ORDER BY id FOR UPDATE', [targets.map(t => t.id)]);
      for (const t of targets) {
        const permissions = (await c.query('SELECT p.key FROM role_permissions rp JOIN permissions p ON p.id=rp."permissionId" WHERE rp."roleId"=$1', [t.roleId])).rows.map(r => r.key);
        assert.ok(permissions.includes("pricing.view") && permissions.includes("pricing.estimates.create"));
        if (t.id === admin) assert.ok(permissions.includes("pricing.pricebooks.manage") && permissions.includes("pricing.estimates.view_all"));
        for (const book of t.books) { await identity(); await c.query('INSERT INTO user_price_book_grants ("userId","bookId","assignedByUserId") VALUES ($1,$2::"PriceBookCode",$3) ON CONFLICT DO NOTHING', [t.id, book, admin]); }
        await identity(); await c.query('INSERT INTO user_pricing_preferences ("userId","defaultBookId") VALUES ($1,$2::"PriceBookCode") ON CONFLICT ("userId") DO UPDATE SET "defaultBookId"=excluded."defaultBookId"', [t.id, t.defaultBookId]);
        if (!before.defaults.some(r => r.userId === t.id)) {
          await identity(); await c.query('INSERT INTO audit_logs (id,"actorUserId",action,"entityType","entityId","entityLabel",metadata) VALUES ($1,$2,\'USER_PRICE_BOOKS_CHANGED\',\'USER\',$3,$4,$5::jsonb)', [randomUUID(), admin, t.id, t.name, JSON.stringify({ bookIds: t.books, defaultBookId: t.defaultBookId, operation: "Approved Phase 05 child activation" })]);
        }
      }
    }
    const after = await profiles(); assert.equal(after.grants.length, 4); assert.equal(after.defaults.length, 2);
    for (const t of targets) { assert.deepEqual(after.grants.filter(r => r.userId === t.id).map(r => r.bookId).sort(), [...t.books].sort()); assert.equal(after.defaults.find(r => r.userId === t.id).defaultBookId, t.defaultBookId); }
    assert.deepEqual(await baseline(plan.cutoff), plan.baseline); await identity();
    console.log(JSON.stringify({ mode, branch: CHILD.branch, ...after, baselineCounts: plan.counts, integrity: "All pre-existing business records, users, memberships, ownership, sessions and historical snapshots unchanged" }));
  }
  await c.query("COMMIT");
} catch { await c.query("ROLLBACK").catch(() => {}); console.error("Phase 05 activation blocked: child, accounts, migration, grants or protected baseline mismatch. Credentials suppressed; transaction rolled back."); process.exitCode = 1; }
finally { await c.end(); }
