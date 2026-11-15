import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { readFileSync } from "node:fs";
import { PERMISSION_KEYS as P, PRICING_CATALOG_VERSION, type AuthUser, type PricingEstimateListQuery } from "@nbs/shared";
import { prisma } from "../lib/prisma";
import { pricingRates } from "./pricing-currency.service";
import { AppError } from "../lib/errors";
import { env } from "../env";
import { marketContext } from "../lib/market-context";
import { installMarketStore } from "../test/market-store";
import { createPricingEstimate, copyPricingEstimate, getPricingEstimate, listPricingEstimates } from "./pricing-estimates.service";

const actor = (id = "partner", more: string[] = [], admin = false): AuthUser => ({ id, permissions: [P.PRICING_VIEW, P.PRICING_ESTIMATES_CREATE, P.COMPANIES_VIEW, ...more], role: { id: admin ? "admin-role" : "sales-role", name: admin ? "Admin" : "Sales", isSystem: true, description: null } } as AuthUser);
const run = <T>(who: AuthUser, work: () => T) => marketContext.run({ actor: () => who }, work);
const input = (companyId: string | null = null) => ({ title: " Fixture estimate ", notes: " Internal notes ", companyId,
  configuration: { configurationVersion: 1 as const, catalogVersion: PRICING_CATALOG_VERSION, product: "erp" as const,
    modules: ["erp-inventory", "erp-core"], addons: [], customModuleTier: [], customSoftwareTier: null, customNotes: " scope " } });
const list = (patch: Partial<PricingEstimateListQuery> = {}) => listPricingEstimates({ page: 1, pageSize: 20, search: "", scope: "all", ...patch });
function fixture(t: TestContext) {
  assert.equal(new URL(env.DATABASE_URL).hostname, "127.0.0.1"); assert.equal(new URL(env.DATABASE_URL).port, "1");
  env.MARKET_ACCESS_MODE = "enforced";
  return installMarketStore(t);
}

test("standalone estimates are creator private; broader visibility never overrides market/company permission", async t => {
  fixture(t);
  const own = await run(actor(), () => createPricingEstimate(input()));
  const other = await run(actor("uk"), () => createPricingEstimate(input()));
  const uk = await run(actor("uk"), () => createPricingEstimate(input("c1")));
  const jo = await run(actor("admin", [], true), () => createPricingEstimate(input("c0")));
  assert.equal((await run(actor(), () => list())).total, 1);
  await assert.rejects(run(actor(), () => getPricingEstimate(other.id)), /not found/);
  const broad = actor("partner", [P.PRICING_ESTIMATES_VIEW_ALL]);
  assert.deepEqual((await run(broad, () => list())).items.map(r => r.id).sort(), [own.id, other.id, jo.id].sort());
  await assert.rejects(run(broad, () => getPricingEstimate(uk.id)), /not found/);
  assert.equal((await run(broad, () => list({ companyId: "c1" }))).total, 0);
  const noCompany = { ...broad, permissions: broad.permissions.filter(p => p !== P.COMPANIES_VIEW) };
  assert.equal((await run(noCompany, () => list())).total, 2);
  await assert.rejects(run(noCompany, () => getPricingEstimate(jo.id)), /not found/);
  const admin = actor("admin", [P.PRICING_ESTIMATES_VIEW_ALL], true);
  assert.equal((await run(admin, () => list())).total, 4);
});

test("zero-market standalone saving works; inaccessible, legacy and missing company links fail identically", async t => {
  fixture(t);
  const user = actor("unassigned");
  const standalone = await run(user, () => createPricingEstimate(input()));
  assert.equal(standalone.companyId, null); assert.equal(standalone.title, "Fixture estimate");
  assert.equal((standalone.result as { estimatedTotal: number }).estimatedTotal, 1300);
  for (const id of ["c0", "c1", "c3", "unknown"]) await assert.rejects(run(user, () => createPricingEstimate(input(id))), /Company not found/);
  for (const id of ["c1", "c3"]) await assert.rejects(run(actor(), () => createPricingEstimate(input(id))), /Company not found/);
  assert.ok(await run(actor("admin", [], true), () => createPricingEstimate(input("c3"))));
  const noPricing = { ...actor("admin", [], true), permissions: [P.PRICING_ESTIMATES_CREATE, P.PRICING_ESTIMATES_VIEW_ALL] };
  await assert.rejects(run(noPricing, () => createPricingEstimate(input())), /permission/);
  await assert.rejects(run(noPricing, () => list()), /permission/);
  const viewOnly = { ...actor(), permissions: [P.PRICING_VIEW] };
  await assert.rejects(run(viewOnly, () => createPricingEstimate(input())), /permission/);
});

test("membership removal and company reterritoring hide saved records without changing ownership or snapshots", async t => {
  const f = fixture(t);
  const saved = await run(actor(), () => createPricingEstimate(input("c0")));
  const snapshot = structuredClone(f.tables.pricingEstimate);
  const owners = structuredClone([f.tables.company, f.tables.opportunity]);
  f.tables.userSalesMarket = f.tables.userSalesMarket!.filter(r => r.userId !== "partner");
  await assert.rejects(run(actor(), () => getPricingEstimate(saved.id)), /not found/);
  assert.equal((await run(actor(), () => list())).total, 0);
  assert.deepEqual(f.tables.pricingEstimate, snapshot); assert.deepEqual([f.tables.company, f.tables.opportunity], owners);
  f.tables.userSalesMarket!.push({ userId: "partner", marketCode: "JO" });
  assert.equal((await run(actor(), () => getPricingEstimate(saved.id))).id, saved.id);
  f.tables.company![0]!.salesMarketCode = "UK";
  await assert.rejects(run(actor(), () => getPricingEstimate(saved.id)), /not found/);
  assert.deepEqual(f.tables.pricingEstimate, snapshot);
});

test("every save recalculates, normalizes and pins versions; copies never overwrite snapshots", async t => {
  const f = fixture(t);
  const original = await run(actor(), () => createPricingEstimate(input()));
  assert.equal(original.catalogVersion, PRICING_CATALOG_VERSION); assert.equal(original.calculationVersion, "cheapest-preset-v1");
  assert.deepEqual((original.selection as { modules: string[] }).modules, ["erp-core", "erp-inventory"]);
  const before = structuredClone(f.tables.pricingEstimate![0]);
  const copied = await run(actor(), () => copyPricingEstimate(original.id, { ...input(), title: "Revised copy" }));
  assert.notEqual(copied.id, original.id); assert.deepEqual(f.tables.pricingEstimate![0], before);
  for (const method of ["update", "updateMany", "delete", "deleteMany", "upsert", "createMany"] as const) {
    await assert.rejects(run(actor(), () => Reflect.apply(Reflect.get(prisma.pricingEstimate, method), prisma.pricingEstimate, [{}])), /immutable/);
  }
  await assert.rejects(run(actor("uk"), () => copyPricingEstimate(original.id, input())), /not found/);
  for (const extra of [{ estimatedTotal: 1 }, { result: { estimatedTotal: 1 } }, { createdById: "admin" }, { calculationVersion: "forged" }, { id: original.id }, { createdAt: "forged" }]) {
    await assert.rejects(run(actor(), () => createPricingEstimate({ ...input(), ...extra })));
  }
  await assert.rejects(run(actor(), () => createPricingEstimate({ ...input(), configuration: { ...input().configuration, claimedEstimate: 1 } })));
  // Manufacture a historical fixture: reading must not depend on the current registry/schema/prices.
  Object.assign(f.tables.pricingEstimate![0]!, { catalogVersion: "retained-old-catalog", calculationVersion: "old-engine",
    selection: { ...(original.selection as object), catalogVersion: "retained-old-catalog" },
    result: { ...(original.result as object), catalogVersion: "retained-old-catalog", estimatedTotal: 777, componentOnlyTotal: 777, bundleSavings: 0,
      lineItems: [{ id: "historical-package", kind: "module", quote: { kind: "exact", amount: 777 }, amount: 777, isEstimateFloor: false }] } });
  assert.equal((await run(actor(), () => getPricingEstimate(original.id))).catalogVersion, "retained-old-catalog");
  assert.equal(((await run(actor(), () => getPricingEstimate(original.id))).result as { estimatedTotal: number }).estimatedTotal, 777);
});

test("pagination/count/search stay scoped, and nested company/user paths cannot expose estimate data", async t => {
  fixture(t);
  await run(actor(), () => createPricingEstimate(input())); await run(actor(), () => createPricingEstimate(input()));
  await run(actor("uk"), () => createPricingEstimate(input()));
  const page = await run(actor(), () => list({ pageSize: 1 })); assert.equal(page.items.length, 1); assert.equal(page.total, 2);
  assert.equal((await run(actor(), () => list({ createdById: "uk" }))).total, 0);
  for (const user of [actor(), actor("admin", [P.PRICING_ESTIMATES_VIEW_ALL], true)]) {
    await assert.rejects(run(user, () => prisma.company.findMany({ include: { pricingEstimates: true } })), /authorized pricing/);
    await assert.rejects(run(user, () => prisma.user.findMany({ include: { _count: { select: { pricingEstimates: true } } } })), /authorized pricing/);
    await assert.rejects(run(user, () => prisma.company.findMany({ include: { _count: true } })), /explicit relation counts/);
  }
});

test("linked estimates prevent company deletion even without pricing visibility; outages recover as 503", async t => {
  const f = fixture(t);
  await run(actor(), () => createPricingEstimate(input("c0")));
  const companyAdmin = { ...actor("admin", [], true), permissions: [] };
  await assert.rejects(run(companyAdmin, () => prisma.company.delete({ where: { id: "c0" } })), /historical CRM records/);
  env.MARKET_ACCESS_MODE = "legacy";
  await assert.rejects(run(companyAdmin, () => prisma.company.delete({ where: { id: "c0" } })), /historical CRM records/);
  env.MARKET_ACCESS_MODE = "enforced";
  f.setOutage(true);
  await assert.rejects(run(actor(), () => list()), (e: unknown) => (e as { status: number }).status === 503);
  await assert.rejects(run(actor(), () => createPricingEstimate(input())), (e: unknown) => (e as { status: number }).status === 503);
  f.setOutage(false); assert.equal((await run(actor(), () => list())).total, 1);
});

test("migration is additive, bounded, append-only, and has restrictive company/user foreign keys", () => {
  const sql = readFileSync(new URL("../../prisma/migrations/20261108120000_pricing_estimates/migration.sql", import.meta.url), "utf8");
  assert.match(sql, /lock_timeout = '5s'/); assert.match(sql, /statement_timeout = '60s'/);
  assert.match(sql, /REFERENCES "companies"\("id"\) ON DELETE RESTRICT/);
  assert.match(sql, /REFERENCES "users"\("id"\) ON DELETE RESTRICT/);
  assert.match(sql, /BEFORE UPDATE OR DELETE/); assert.match(sql, /RAISE EXCEPTION/);
  assert.equal(/\b(DROP|TRUNCATE|DELETE\s+FROM)\b|\bUPDATE\s+"/i.test(sql), false);
});

test("missing estimate schema is unavailable and concurrent saves/deletion races return recoverable conflicts", async t => {
  fixture(t);
  const originalFind = prisma.pricingEstimate.findUnique;
  Reflect.set(prisma.pricingEstimate, "findUnique", async () => { throw Object.assign(new Error("synthetic missing schema"), { code: "P2021" }); });
  t.after(() => { Reflect.set(prisma.pricingEstimate, "findUnique", originalFind); });
  await assert.rejects(run(actor(), () => getPricingEstimate("fixture")), (error: unknown) => (error as { status: number }).status === 503);
  Reflect.set(prisma.pricingEstimate, "findUnique", originalFind);
  const transaction = prisma.$transaction;
  t.after(() => { Reflect.set(prisma, "$transaction", transaction); });
  for (const code of ["P2034", "P2003"]) {
    Reflect.set(prisma, "$transaction", async () => { throw Object.assign(new Error("synthetic race"), { code }); });
    await assert.rejects(run(actor(), () => createPricingEstimate(input())), (error: unknown) => (error as { status: number }).status === 409);
  }
  Reflect.set(prisma, "$transaction", transaction);
});

test("company deletion FK races map to 409 and save/copy bounds reject forged metadata", async t => {
  fixture(t);
  await assert.rejects(run(actor("admin", [], true), () => prisma.$transaction(async tx => {
    const companyDelete = tx.company.delete;
    Reflect.set(tx.company, "delete", async () => { throw Object.assign(new Error("synthetic FK race"), { code: "P2003" }); });
    try { return await tx.company.delete({ where: { id: "c0" } }); }
    finally { Reflect.set(tx.company, "delete", companyDelete); }
  })), (error: unknown) => (error as { status: number }).status === 409);
  for (const invalid of [{ ...input(), title: " " }, { ...input(), title: "x".repeat(201) }, { ...input(), notes: "x".repeat(4001) }, { ...input(), companyId: 42 },
    { ...input(), configuration: { ...input().configuration, catalogVersion: "unregistered" } },
    JSON.parse(JSON.stringify(input()).slice(0, -1) + ',"__proto__":{}}')]) {
    await assert.rejects(run(actor(), () => createPricingEstimate(invalid)));
  }
});

test("converted saves retain JOD and immutable display snapshots; reads survive outages and copies revalidate rates", async t => {
  const f = fixture(t); let rate = 1.25; let outage = false;
  t.mock.method(pricingRates, "get", async (currency: "JOD" | "USD" | "GBP") => { if (outage) throw new AppError(503, "EXCHANGE_RATES_UNAVAILABLE", "fixture"); return { version: "fx-line-half-up-v1" as const, base: "JOD" as const, currency, rate, source: "Frankfurter v2" as const, sourceUrl: "https://frankfurter.dev/" as const, effectiveDate: "2026-11-14", retrievedAt: "2026-11-14T12:00:00.000Z", expiresAt: "2026-11-14T18:00:00.000Z" }; });
  const saved = await run(actor(), () => createPricingEstimate({ ...input(), displayCurrency: "GBP" }));
  const result = saved.result as { currency: string; estimatedTotal: number; conversion: { exchange: { currency: string; rate: number }; result: { estimatedTotal: number } } };
  assert.equal(saved.currency, "JOD"); assert.equal(result.currency, "JOD"); assert.equal(result.estimatedTotal, 1300); assert.equal(result.conversion.exchange.currency, "GBP"); assert.equal(result.conversion.result.estimatedTotal, 1625);
  const snapshot = structuredClone(f.tables.pricingEstimate); outage = true;
  assert.deepEqual((await run(actor(), () => getPricingEstimate(saved.id))).result, saved.result);
  await assert.rejects(run(actor(), () => createPricingEstimate({ ...input(), displayCurrency: "GBP" })), { status: 503 }); assert.deepEqual(f.tables.pricingEstimate, snapshot);
  outage = false; rate = 1.5; const copy = await run(actor(), () => copyPricingEstimate(saved.id, { ...input(), displayCurrency: "GBP" }));
  assert.equal((copy.result as typeof result).conversion.result.estimatedTotal, 1950); assert.deepEqual(f.tables.pricingEstimate![0], snapshot![0]);
  for (const forged of [{ exchangeRate: 1 }, { conversion: {} }, { convertedTotal: 1 }, { displayCurrency: "EUR" }]) await assert.rejects(run(actor(), () => createPricingEstimate({ ...input(), ...forged })));
});
