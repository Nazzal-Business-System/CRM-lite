import pg from "pg";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { homedir } from "node:os";
import assert from "node:assert/strict";
import { verifyChild } from "./isolated-dev-guard";

const url = process.env.DATABASE_URL!;
await verifyChild(url);
const c = new pg.Client({ connectionString: url, options: "-c default_transaction_read_only=on" });
try {
  await c.connect(); await c.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  const baseline: Record<string, unknown> = {};
  for (const table of ["companies", "contacts", "opportunities"]) {
    // Company updatedAt changes during the approved territory backfill; all other original fields must survive.
    const row = table === "companies"
      ? "to_jsonb(t) - 'countryCode' - 'salesMarketCode' - 'countryMarketLegacyCohort' - 'updatedAt'"
      : "to_jsonb(t)";
    baseline[table] = (await c.query(`SELECT count(*)::int AS count, md5(coalesce(string_agg((${row})::text, ',' ORDER BY id),'')) AS integrity FROM "${table}" t`)).rows[0];
  }
  await c.query("ROLLBACK");
  const path = resolve(homedir(), "AppData/Local/NBS/CRM-lite-isolated/baseline.json");
  if (process.argv[2] === "snapshot") writeFileSync(path, JSON.stringify(baseline), { flag: "wx" });
  else assert.deepEqual(baseline, JSON.parse(readFileSync(path, "utf8")));
  console.log(JSON.stringify({ operation: process.argv[2], counts: Object.fromEntries(Object.entries(baseline).map(([name, value]) => [name, (value as { count: number }).count])), integrity: "passed" }));
} finally { await c.end(); }
