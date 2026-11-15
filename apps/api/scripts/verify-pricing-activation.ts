import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";
import { CHILD, verifyChild } from "./isolated-dev-guard";
import { calculateSavedSelection } from "../src/pricing/registry";
import { PRICING_CATALOG_VERSION } from "@nbs/shared";

const url = process.env.DIRECT_URL!;
await verifyChild(url);
const c = new pg.Client({ connectionString: url, connectionTimeoutMillis: 15000, query_timeout: 15000 });
const userId = randomUUID(), companyId = randomUUID(), estimateId = randomUUID();
async function identity() {
  const row = (await c.query("SELECT current_database() AS database,current_setting('neon.project_id',true) AS project,current_setting('neon.branch_id',true) AS branch,current_setting('neon.endpoint_id',true) AS endpoint")).rows[0];
  assert.deepEqual(row, CHILD);
}
async function write(sql: string, values?: unknown[]) { await identity(); return c.query(sql, values); }
try {
  await c.connect(); await identity();
  const migration = (await c.query("SELECT checksum,finished_at,rolled_back_at FROM _prisma_migrations WHERE migration_name='20261108120000_pricing_estimates'")).rows;
  assert.equal(migration.length, 1); assert.ok(migration[0].finished_at); assert.equal(migration[0].rolled_back_at, null);
  assert.equal(migration[0].checksum, createHash("sha256").update(readFileSync(new URL("../prisma/migrations/20261108120000_pricing_estimates/migration.sql", import.meta.url))).digest("hex"));
  const constraints = (await c.query("SELECT conname,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='public.pricing_estimates'::regclass ORDER BY conname")).rows;
  for (const name of ["pricing_estimates_createdById_fkey", "pricing_estimates_companyId_fkey"]) assert.match(constraints.find(row => row.conname === name)?.definition ?? "", /ON UPDATE RESTRICT ON DELETE RESTRICT/);
  const trigger = (await c.query("SELECT tgname,tgenabled,pg_get_triggerdef(oid) AS definition FROM pg_trigger WHERE tgrelid='public.pricing_estimates'::regclass AND NOT tgisinternal")).rows;
  assert.equal(trigger.length, 1); assert.equal(trigger[0].tgenabled, "O"); assert.match(trigger[0].definition, /BEFORE DELETE OR UPDATE|BEFORE UPDATE OR DELETE/);
  const before = Number((await c.query("SELECT count(*) AS count FROM pricing_estimates")).rows[0].count);
  await c.query("BEGIN"); await c.query("SET LOCAL lock_timeout='5s'"); await c.query("SET LOCAL statement_timeout='15s'");
  const role = (await c.query("SELECT id FROM roles WHERE name='Admin' AND \"isSystem\"=true")).rows[0]; assert.ok(role);
  await write('INSERT INTO users (id,name,email,"passwordHash","roleId","updatedAt") VALUES ($1,$2,$3,$4,$5,now())', [userId, "Disposable transaction fixture", `${userId}@fixture.invalid`, "invalid-disposable-hash", role.id]);
  await write('INSERT INTO companies (id,name,"nameNormalized","countryCode","salesMarketCode","ownerId","updatedAt") VALUES ($1,$2,$3,\'JO\',\'JO\',$4,now())', [companyId, "Disposable transaction fixture", `fixture-${companyId}`, userId]);
  const calculated = calculateSavedSelection({ configurationVersion: 1, catalogVersion: PRICING_CATALOG_VERSION, product: "pos", modules: ["pos-core"], addons: [], customModuleTier: [], customSoftwareTier: null, customNotes: "" });
  await write('INSERT INTO pricing_estimates (id,"createdById","companyId",title,notes,currency,"catalogVersion","calculationVersion","configurationVersion",selection,result) VALUES ($1,$2,$3,$4,\'\',\'JOD\',$5,$6,1,$7::jsonb,$8::jsonb)', [estimateId, userId, companyId, "Disposable rollback fixture", calculated.selection.catalogVersion, calculated.calculationVersion, JSON.stringify(calculated.selection), JSON.stringify(calculated.result)]);
  for (const [sql, values, expectedCode, expectedConstraint] of [
    ['UPDATE pricing_estimates SET result=result || \'{"estimatedTotal":0}\'::jsonb WHERE id=$1', [estimateId], "55000", null],
    ['DELETE FROM pricing_estimates WHERE id=$1', [estimateId], "55000", null],
    ['DELETE FROM companies WHERE id=$1', [companyId], "23503", "pricing_estimates_companyId_fkey"],
    ['DELETE FROM users WHERE id=$1', [userId], "23503", "pricing_estimates_createdById_fkey"],
  ] as const) {
    await c.query("SAVEPOINT protection_probe");
    let code: string | undefined; let constraint: string | undefined;
    try { await write(sql, [...values]); } catch (error) { code = (error as { code?: string }).code; constraint = (error as { constraint?: string }).constraint; }
    await c.query("ROLLBACK TO SAVEPOINT protection_probe");
    if (expectedConstraint) {
      // PostgreSQL distinguishes RESTRICT violations (23001) from FK violations (23503).
      assert.ok(code === "23001" || code === expectedCode); assert.equal(constraint, expectedConstraint);
    } else assert.equal(code, expectedCode);
  }
  assert.deepEqual((await c.query("SELECT result FROM pricing_estimates WHERE id=$1", [estimateId])).rows[0].result, calculated.result);
  await c.query("ROLLBACK");
  assert.equal(Number((await c.query("SELECT count(*) AS count FROM pricing_estimates")).rows[0].count), before);
  for (const [table, id] of [["users", userId], ["companies", companyId], ["pricing_estimates", estimateId]]) assert.equal((await c.query(`SELECT count(*)::int AS count FROM ${table} WHERE id=$1`, [id])).rows[0].count, 0);
  console.log(JSON.stringify({ branch: CHILD.branch, migration: "applied and checksum verified", immutableUpdate: "blocked", immutableDelete: "blocked", companyForeignKey: "restrict verified", creatorForeignKey: "restrict verified", fixtures: "rolled back completely", estimateCount: before }));
} finally { await c.query("ROLLBACK").catch(() => {}); await c.end(); }
