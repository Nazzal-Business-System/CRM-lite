// Actual localhost verification; only new disposable sessions persist (revoked in finally).
// Native estimate/constraint fixtures are contained in a rolled-back child transaction.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { CHILD, verifyChild } from "./isolated-dev-guard";
import { prisma } from "../src/lib/prisma";
import { env } from "../src/env";
import { newSessionToken, hashSessionToken, IDLE_MS, ABSOLUTE_MS } from "../src/services/sessions.service";
import { calculateNativePriceBook, publishedPriceBook, nativePriceBookPrices } from "../src/pricing/price-books";
import { presets } from "../src/pricing/catalog";
import ExcelJS from "exceljs";
import { COMPANY_IMPORT_COLUMNS, CONTACT_IMPORT_COLUMNS, PRICING_CATALOG_VERSION } from "@nbs/shared";
const adminId = "cmt4z6zfq000xxcx4r04xj809", partnerId = "cmv30km8f00011seontkarqbd";
const sessions: string[] = [];
let stage = "initialization";
const c = new pg.Client({ connectionString: process.env.DIRECT_URL, connectionTimeoutMillis: 15000 });
async function target() { await verifyChild(env.DATABASE_URL); await verifyChild(process.env.DIRECT_URL!); }
async function identity() { assert.deepEqual((await c.query("SELECT current_database() AS database,current_setting('neon.project_id',true) AS project,current_setting('neon.branch_id',true) AS branch,current_setting('neon.endpoint_id',true) AS endpoint")).rows[0], CHILD); }
async function protectedRows() {
  const output: Record<string, unknown> = {};
  for (const table of ["companies", "contacts", "opportunities", "users", "user_sales_markets", "pricing_estimates", "pricing_estimate_books", "pricing_estimate_archives", "user_price_book_grants", "user_pricing_preferences"]) output[table] = (await c.query(`SELECT count(*)::int AS count,md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]')) AS digest FROM "${table}" t`)).rows[0];
  return output;
}
async function issue(id: string, name: string) {
  const user = (await c.query('SELECT u.id,u.name,u."sessionVersion",u."isActive",r.name AS role FROM users u JOIN roles r ON r.id=u."roleId" WHERE u.id=$1', [id])).rows[0];
  assert.equal(user.name, name); assert.equal(user.isActive, true);
  const token = newSessionToken(), now = new Date(); await target();
  const row = await prisma.session.create({ data: { userId: id, tokenHash: hashSessionToken(token), sessionVersion: user.sessionVersion, isLegacy: false, lastActivityAt: now, idleExpiresAt: new Date(now.getTime() + IDLE_MS), absoluteExpiresAt: new Date(now.getTime() + ABSOLUTE_MS), userAgent: "Disposable Phase 05 runtime check" } });
  sessions.push(row.id); return token;
}
async function request(origin: string, path: string, token: string | undefined, status: number, body?: unknown) {
  stage = origin + path;
  const r = await fetch(origin + path, { method: body ? "POST" : "GET", redirect: "manual", headers: { ...(token ? { Cookie: `${env.COOKIE_NAME}=${token}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000) });
  assert.equal(r.status, status, path + " status " + r.status); assert.notEqual(r.headers.get("set-cookie")?.includes("Max-Age=0"), true);
  return r;
}
async function data<T>(response: Response): Promise<T> { return (await response.json() as {data:T}).data; }
const selection = { configurationVersion: 1 as const, product: "erp" as const, modules: ["erp-core"], addons: [], customModuleTier: [], customSoftwareTier: null, customNotes: "" };
const bookRef = (id: "JO" | "US" | "UK") => { const b = publishedPriceBook(id); return { id, version: b.version, structureVersion: b.structureVersion }; };
async function rollbackFixtures() {
  stage = "rolled-back native database fixtures";
  await identity(); await c.query("BEGIN"); await c.query("SET LOCAL lock_timeout='5s'"); await c.query("SET LOCAL statement_timeout='20s'");
  const insert = async (id: string, bookId: "JO" | "US" | "UK") => {
    const b = publishedPriceBook(bookId), result = calculateNativePriceBook(selection, b);
    stage = "fixture insert " + bookId;
    await identity(); await c.query('INSERT INTO pricing_estimates (id,"createdById",title,notes,currency,"catalogVersion","calculationVersion","configurationVersion",selection,result) VALUES ($1,$2,$3,\'\',$4,$5,$6,1,$7::jsonb,$8::jsonb)', [id, adminId, "Rolled-back Phase 05 fixture", b.currency, b.version, result.calculationVersion, JSON.stringify({ ...selection, catalogVersion: b.version }), JSON.stringify(result)]);
  };
  const rejected = async (sql: string, params: unknown[], expected: string) => {
    await c.query("SAVEPOINT invalid_fixture");
    try { await identity(); await c.query(sql, params); assert.fail("Expected database constraint rejection"); } catch (e) { assert.equal((e as { code?: string }).code, expected); } finally { await c.query("ROLLBACK TO SAVEPOINT invalid_fixture"); }
  };
  try {
    for (const id of ["JO", "US", "UK"] as const) {
      // The previous fixture explicitly flushed deferred constraints. Restore normal
      // transaction semantics before inserting the next estimate and its binding.
      await c.query("SET CONSTRAINTS ALL DEFERRED");
      const fixture = randomUUID(), b = publishedPriceBook(id); await insert(fixture, id);
      stage = "fixture binding " + id;
      await identity(); await c.query('INSERT INTO pricing_estimate_books ("estimateId","bookId","bookVersion","structureVersion") VALUES ($1,$2::"PriceBookCode",$3,$4)', [fixture, id, b.version, b.structureVersion]);
      stage = "fixture constraint flush " + id;
      await c.query("SET CONSTRAINTS ALL IMMEDIATE");
      await rejected('INSERT INTO pricing_estimate_archives ("estimateId","archivedById") VALUES ($1,$2)', [fixture, partnerId], "23514");
      await identity(); await c.query('INSERT INTO pricing_estimate_archives ("estimateId","archivedById") VALUES ($1,$2)', [fixture, adminId]);
      await rejected('UPDATE pricing_estimate_archives SET "archivedAt"=now() WHERE "estimateId"=$1', [fixture], "55000");
      await rejected('DELETE FROM pricing_estimate_archives WHERE "estimateId"=$1', [fixture], "55000");
      await rejected('UPDATE pricing_estimates SET title=\'Changed\' WHERE id=$1', [fixture], "55000");
      await rejected('DELETE FROM pricing_estimates WHERE id=$1', [fixture], "55000");
      await rejected('UPDATE pricing_estimate_books SET "bookVersion"=\'forged\' WHERE "estimateId"=$1', [fixture], "55000");
    }
    await c.query("SET CONSTRAINTS ALL DEFERRED");
    const missing = randomUUID(); await insert(missing, "US");
    await rejected("SET CONSTRAINTS ALL IMMEDIATE", [], "23514");
    await rejected('INSERT INTO pricing_estimate_books ("estimateId","bookId","bookVersion","structureVersion") VALUES ($1,\'UK\',$2,$3)', [missing, publishedPriceBook("UK").version, publishedPriceBook("UK").structureVersion], "23514");
    // An unauthorized default cannot reference a book without a matching explicit user grant.
    await rejected('UPDATE user_pricing_preferences SET "defaultBookId"=\'US\' WHERE "userId"=$1', [partnerId], "23503");
  } finally { await c.query("ROLLBACK"); }
  console.log(JSON.stringify({ childTransactionFixtures: "PASS: JO/USD/GBP snapshot inserts; immutable update/delete; required/matching binding; authorized-default FK; creator-only append-only archive markers", persistedEstimates: 0 }));
}
try {
  assert.equal(env.PORT, 4000); assert.equal(env.PRICING_MODE, "price_books"); assert.equal(env.MARKET_ACCESS_MODE, "enforced"); assert.equal(env.SESSION_TOKEN_MODE, "opaque"); assert.equal(env.ACCEPT_LEGACY_JWT, "true");
  await target(); await c.connect(); await identity(); const baseline = await protectedRows();
  if (!process.argv.includes("--database-only")) {
  const admin = await issue(adminId, "Ahmad Nazzal"), partner = await issue(partnerId, "Mahmoud Al-Haj");
  for (const origin of ["http://127.0.0.1:4000", "http://localhost:3000"]) {
    let partnerCanViewDemos=false;
    for (const [token, books, defaultBookId] of [[admin, ["JO", "US", "UK"], "US"], [partner, ["JO"], "JO"]] as const) {
      const identity=await data<{user:{permissions:string[]}}>(await request(origin, "/api/auth/me", token, 200));
      if(token===partner)partnerCanViewDemos=identity.user.permissions.includes("demos.view");
      const access = await data<{bookIds:string[];defaultBookId:string;books:unknown[]}>(await request(origin, "/api/pricing/price-books", token, 200));
      assert.deepEqual([...access.bookIds].sort(), [...books].sort()); assert.equal(access.defaultBookId, defaultBookId);
      assert.equal(access.books.length, books.length);
      const defaults = await data<ReturnType<typeof nativePriceBookPrices>>(await request(origin, "/api/pricing/price-books/default/prices", token, 200));
      assert.equal(defaults.priceBook.id, defaultBookId);
      for (const id of ["JO", "US", "UK"] as const) {
        const permitted = (books as readonly string[]).includes(id), expected = permitted ? 200 : 403;
        const prices = await request(origin, "/api/pricing/price-books/" + id + "/prices", token, expected);
        const catalog = await request(origin, "/api/pricing/price-books/" + id + "/catalog", token, expected);
        await request(origin, "/api/pricing/catalog?bookId=" + id, token, expected);
        const calculation = await request(origin, "/api/pricing/price-books/calculate", token, expected, { priceBook: bookRef(id), configuration: selection });
        if (permitted) {
          const p = await data<ReturnType<typeof nativePriceBookPrices>>(prices); assert.equal(p.currency, publishedPriceBook(id).currency); assert.deepEqual(p.products, nativePriceBookPrices(publishedPriceBook(id)).products);
          assert.equal((await data<{catalogVersion:string}>(catalog)).catalogVersion, publishedPriceBook(id).version);
          const value = await data<ReturnType<typeof calculateNativePriceBook>>(calculation); assert.deepEqual(value, calculateNativePriceBook(selection, publishedPriceBook(id))); assert.equal("exchange" in value, false);
        } else {
          await request(origin, "/api/pricing/estimates", token, 403, { title: "Must not save", notes: "", companyId: null, priceBook: bookRef(id), configuration: selection });
          await request(origin, "/api/pricing/estimates/nonexistent-safe-fixture/copies", token, 403, { title: "Must not copy", notes: "", companyId: null, priceBook: bookRef(id), configuration: selection });
          assert.ok(!(await prices.text()).includes('"amount"'));
        }
      }
      await request(origin, "/api/pricing/estimates", token, 200);
    }
    for (const id of ["JO", "US", "UK"] as const) for (const preset of presets) {
      const r = await request(origin, "/api/pricing/price-books/calculate", admin, 200, { priceBook: bookRef(id), configuration: { ...selection, product: preset.product, modules: [...preset.moduleIds] } });
      assert.deepEqual(await data<ReturnType<typeof calculateNativePriceBook>>(r), calculateNativePriceBook({ ...selection, product: preset.product, modules: [...preset.moduleIds] }, publishedPriceBook(id)));
    }
    await request(origin, "/api/pricing/price-books/US/prices", undefined, 401);
    for (const path of ["/api/pricing/prices", "/api/pricing/exchange-rates"]) await request(origin, path, admin, 409);
    await request(origin, "/api/pricing/calculate", admin, 409, { ...selection, catalogVersion: PRICING_CATALOG_VERSION });
    const companies = await data<{total:number}>(await request(origin, "/api/companies", admin, 200)); assert.equal(companies.total, 74);
    const filtered = await data<{total:number}>(await request(origin, "/api/companies?countryCode=JO&salesMarketCode=JO", admin, 200)); assert.equal(filtered.total, 74);
    await request(origin, "/api/companies/sales-markets", admin, 200); await request(origin, "/api/demos", admin, 200); await request(origin, "/api/demos", partner, partnerCanViewDemos?200:403);
    for (const [entity,headers] of [["COMPANIES",COMPANY_IMPORT_COLUMNS],["CONTACTS",CONTACT_IMPORT_COLUMNS]] as const) {
      const csv=await request(origin,"/api/imports/template?entity="+entity+"&format=csv",admin,200);assert.equal((await csv.text()).replace(/^\uFEFF/,"").trim(),headers.map(h=>'"'+h+'"').join(","));
      const xlsx=await request(origin,"/api/imports/template?entity="+entity+"&format=xlsx",admin,200);const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(Buffer.from(await xlsx.arrayBuffer()) as unknown as ExcelJS.Buffer);assert.deepEqual((workbook.worksheets[0]!.getRow(1).values as unknown[]).slice(1),headers);
      const prompt=await data<{prompt:string}>(await request(origin,"/api/imports/ai-prompt?entity="+entity,admin,200));assert.ok(prompt.prompt.includes(headers.join(" | ")));
    }
    const previewForm=new FormData();previewForm.set("entity","COMPANIES");previewForm.set("file",new Blob(["Company Name,Country Code,Sales Market\nPreview-only UX acceptance,GB,US\n"]),"preview-only.csv");
    const preview=await fetch(origin+"/api/imports/parse",{method:"POST",headers:{Cookie:`${env.COOKIE_NAME}=${admin}`},body:previewForm,signal:AbortSignal.timeout(30000)});assert.equal(preview.status,200);const parsed=await data<{preview:{rows:Array<{status:string}>}}>(preview);assert.notEqual(parsed.preview.rows[0]!.status,"INVALID");
    console.log(JSON.stringify({ origin, result: "PASS", admin: "3 books/default US; all presets", partner: "JO/default JO; US/UK reads/calculations/saves/copies denied 403", unauthenticated: 401, legacyFx: 409, companies: 74, markets: 200, demosAdmin: 200, demosPartner: partnerCanViewDemos?200:403, importTemplatesAndPrompts:"CSV/XLSX headers match; authenticated preview succeeds without writes" }));
  }
  for(const path of ["/pricing","/pricing/estimates","/companies","/imports"]){const page=await request("http://localhost:3000",path,admin,200);assert.match(page.headers.get("content-type")??"",/text\/html/);await page.text();}
  for(const font of ["22a5144ee8d83bca-s.p.woff2","7d4881bb7e1bf84d-s.p.woff2","b261c59b2d76913d-s.p.woff2"]){const response=await request("http://localhost:3000","/fonts/"+font,undefined,200);assert.equal(Buffer.from(await response.arrayBuffer()).subarray(0,4).toString(),"wOF2");}

  }
  await rollbackFixtures(); assert.deepEqual(await protectedRows(), baseline);
  console.log(JSON.stringify({ result: "PASS", businessAndHistoricalRows: "unchanged", browserVisualAcceptance: "not performed" }));
} catch (e) { console.error("Phase 05 runtime check failed:", e instanceof assert.AssertionError ? e.message : "Infrastructure failure; credentials suppressed."); console.error(JSON.stringify({stage, code: e && typeof e==="object" && "code" in e ? String(e.code) : "UNCLASSIFIED", constraint: e && typeof e==="object" && "constraint" in e ? String(e.constraint) : undefined})); process.exitCode = 1; }
finally {
  await c.query("ROLLBACK").catch(() => {});
  try { for (const id of sessions) { await target(); await prisma.session.update({ where: { id }, data: { revokedAt: new Date(), revocationReason: "LOGOUT" } }); } if (sessions.length) console.log(JSON.stringify({ disposableSessionsRevoked: sessions.length })); }
  finally { await c.end().catch(() => {}); await prisma.$disconnect(); }
}
