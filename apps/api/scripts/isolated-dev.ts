// This launcher never loads repository .env files. Only the private child configuration is accepted.
import { readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import pg from "pg";
import { createHash } from "node:crypto";
import { validateChildUrl, verifyChild } from "./isolated-dev-guard";
import { guardEstimateArchiveMigration } from "./estimate-archive-rollout";
import { guardPriceBookMigration } from "./price-book-rollout";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const mode = process.argv[2] || "check";
const expectedPending = ["20261104120000_company_countries_markets", "20261107120000_user_sales_markets", "20261108120000_pricing_estimates", "20261114120000_partner_market_defaults", "20261114180000_market_price_books", "20261115120000_estimate_archives"];
try {
  const config = JSON.parse(readFileSync(resolve(homedir(), "AppData/Local/NBS/CRM-lite-isolated/environment.json"), "utf8")) as Record<string, string>;
  if (!config.DATABASE_URL || !config.DIRECT_URL || !config.JWT_SECRET || config.JWT_SECRET.length < 32) throw new Error("Missing private configuration.");
  validateChildUrl(config.DATABASE_URL); validateChildUrl(config.DIRECT_URL);
  const runtime = await verifyChild(config.DATABASE_URL);
  const migration = await verifyChild(config.DIRECT_URL);
  console.log(JSON.stringify({ verifiedChild: runtime, migrationFingerprint: migration.fingerprint, operation: mode }));
  const childEnv: NodeJS.ProcessEnv = { ...process.env, ...config, NODE_ENV: "development", HOST: "127.0.0.1", PORT: "4000",
    API_URL: "http://127.0.0.1:4000", CORS_ORIGINS: "http://localhost:3000", COOKIE_NAME: "nbs_crm_dev_session",
    COOKIE_SECURE: "false", COOKIE_DOMAIN: "", COOKIE_SAMESITE: "lax", SESSION_TOKEN_MODE: "opaque",
    ACCEPT_LEGACY_JWT: "true", MARKET_ACCESS_MODE: "enforced", CRM_ISOLATED_DEV: "true", PRICING_MODE: config.PRICING_MODE ?? "legacy_fx" };
  let args: string[];
  let cwd = root;
  const tsx = ["--import", "tsx"];
  if (mode === "check" || mode === "migrate" || mode === "migrate-pricing" || mode === "migrate-partners" || mode === "migrate-price-books" || mode === "migrate-estimate-archives") {
    const c = new pg.Client({ connectionString: config.DIRECT_URL, options: "-c default_transaction_read_only=on", connectionTimeoutMillis: 15000 });
    try {
      await c.connect();
      const rows = (await c.query<{ migration_name: string; finished_at: Date | null; rolled_back_at: Date | null }>("SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations")).rows;
      if (rows.some(r => !r.finished_at && !r.rolled_back_at)) throw new Error("Unfinished migration requires review.");
      const applied = new Set(rows.filter(r => r.finished_at && !r.rolled_back_at).map(r => r.migration_name));
      const pending = readdirSync(resolve(root, "apps/api/prisma/migrations"), { withFileTypes: true }).filter(d => d.isDirectory() && !applied.has(d.name)).map(d => d.name).sort();
      console.log(JSON.stringify({ pending }));
      if (pending.some(p => !expectedPending.includes(p))) throw new Error("Unexpected pending migration.");
      guardEstimateArchiveMigration(mode,pending,readFileSync(resolve(root,"apps/api/prisma/migrations/20261115120000_estimate_archives/migration.sql"),"utf8"));
      guardPriceBookMigration(mode, pending, readFileSync(resolve(root, "apps/api/prisma/migrations/20261114180000_market_price_books/migration.sql"), "utf8"));
      if (mode === "migrate-pricing" && (pending.length !== 1 || pending[0] !== "20261108120000_pricing_estimates")) throw new Error("Pricing activation requires exactly the reviewed pricing migration.");
      if (mode === "migrate-partners" && (pending.length !== 1 || pending[0] !== "20261114120000_partner_market_defaults")) throw new Error("Partner activation requires exactly its additive migration.");
      if (mode === "migrate-partners") {
        const plan = JSON.parse(readFileSync(resolve(homedir(), "AppData/Local/NBS/CRM-lite-isolated/phase04-partner-plan.json"), "utf8"));
        const checksum = createHash("sha256").update(readFileSync(resolve(root, "apps/api/prisma/migrations/20261114120000_partner_market_defaults/migration.sql"))).digest("hex");
        if (plan.target !== runtime.branch || plan.migration !== pending[0] || plan.checksum !== checksum) throw new Error("Reviewed partner migration plan does not match.");
      }
    } finally { await c.end(); }
    if (mode === "check") process.exit(0);
    // Both migrations get bounded timeouts, including Phase 02A which has none in its SQL.
    const direct = new URL(childEnv.DIRECT_URL!);
    direct.searchParams.set("options", "-c lock_timeout=5s -c statement_timeout=60s");
    childEnv.DIRECT_URL = direct.href;
    args = [resolve(root, "node_modules/prisma/build/index.js"), "migrate", "deploy"];
    cwd = resolve(root, "apps/api");
  } else if (mode === "price-book-permission-check" || mode === "price-book-permission-apply") {
    if(process.argv.length!==3)throw new Error("No role or account grants are accepted by this operation.");
    args=[...tsx,"apps/api/scripts/sync-price-book-permission.ts",mode.endsWith("-check")?"--check":"--apply"];
    if(mode.endsWith("-apply"))args.push(`--confirm-target=${runtime.fingerprint}`);
  } else if (["pricing-permissions-check", "pricing-permissions-apply", "demos-permissions-check", "demos-permissions-apply"].includes(mode)) {
    const roleArgs = process.argv.slice(3);
    if (!(roleArgs.length === 1 && roleArgs[0] === "--admin-only") && (!roleArgs.length || roleArgs.some(arg => !arg.startsWith("--sales-partner-role-id=")))) throw new Error("Choose Admin-only or explicit approved partner role IDs.");
    args = [...tsx, mode.startsWith("demos-") ? "apps/api/scripts/sync-demos-permissions.ts" : "apps/api/scripts/sync-pricing-permissions.ts", mode.endsWith("-check") ? "--check" : "--apply", ...roleArgs];
    if (mode.endsWith("-apply")) args.push(`--confirm-target=${runtime.fingerprint}`);
  } else if (/^(markets|backfill|permissions)-(check|apply)$/.test(mode)) {
    const [operation, action] = mode.split("-");
    args = [...tsx, operation === "permissions" ? "apps/api/scripts/sync-market-permission.ts" : "apps/api/scripts/provision-company-territories.ts"];
    if (operation === "backfill") args.push("--backfill");
    args.push(action === "check" ? "--check" : "--apply");
    if (action === "apply") args.push(`--confirm-target=${runtime.fingerprint}`);
  // Native watch restarts the API when imported routes change, preserving the pinned child environment.
  } else if (mode === "api") args = ["--watch", ...tsx, "apps/api/src/index.ts"];
  else if (mode === "web") { args = [resolve(root, "node_modules/next/dist/bin/next"), "dev", "--hostname", "127.0.0.1", "--port", "3000"]; cwd = resolve(root, "apps/web"); }
  else if (mode === "verify") args = [...tsx, "apps/api/scripts/isolated-dev-smoke.ts"];
  else if (mode === "demos-runtime-check") args = [...tsx, "apps/api/scripts/verify-demos-runtime.ts"];
  else if (mode === "partners-check" || mode === "partners-apply") args = [...tsx, "apps/api/scripts/phase04-partners.ts", mode.endsWith("-check") ? "check" : "apply"];
  else if (mode === "partners-runtime-check") args = [...tsx, "apps/api/scripts/verify-partners-runtime.ts"];
  else if (["phase05-check", "phase05-apply", "phase05-verify"].includes(mode)) {
    if (process.argv.length !== 3) throw new Error("Target-specific activation accepts no additional arguments.");
    args = [...tsx, "apps/api/scripts/phase05-activation.ts", mode.slice("phase05-".length)];
  }
  else if (mode === "phase05-runtime-check" || mode === "pricing-runtime-check" || mode === "phase05-database-check") { if(process.argv.length!==3)throw new Error("Runtime checks accept no caller arguments."); args = [...tsx, "apps/api/scripts/verify-phase05-runtime.ts", ...(mode === "phase05-database-check" ? ["--database-only"] : [])]; }
  else if (mode === "pricing-protections-verify") args = [...tsx, "apps/api/scripts/verify-pricing-activation.ts"];
  else if (mode === "snapshot" || mode === "integrity") args = [...tsx, "apps/api/scripts/isolated-dev-integrity.ts", mode];
  else throw new Error("Unknown operation.");
  // Recheck immediately before launching each operation; no caller-supplied command is executed.
  await verifyChild(childEnv.DATABASE_URL!); await verifyChild(childEnv.DIRECT_URL!);
  const child = spawn(process.execPath, args, { cwd, env: childEnv, stdio: "inherit", windowsHide: true });
  child.on("error", () => { console.error("Isolated operation could not start."); process.exitCode = 1; });
  child.on("exit", code => { process.exitCode = code ?? 1; });
} catch {
  console.error("Isolated operation blocked or failed. Verify private configuration, child identity and migration state. Credentials suppressed.");
  process.exitCode = 1;
}
