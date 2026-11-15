import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { PERMISSION_KEYS as P, PRICING_CATALOG_VERSION, PRODUCT_STRUCTURE_VERSION, effectivePriceBookIds, replacePriceBookAccessSchema, type AuthUser } from "@nbs/shared";
import { prisma } from "../lib/prisma";
import { env } from "../env";
import { marketContext } from "../lib/market-context";
import { installMarketStore } from "../test/market-store";
import { replaceUserPriceBookAccess, getUserPriceBookAccess } from "./price-book-access.service";
import { listAuthorizedPriceBooks, getAuthorizedPriceBookPrices, calculateAuthorizedPriceBook } from "./price-books.service";
import { createPricingEstimate, copyPricingEstimate, getPricingEstimate, listPricingEstimates } from "./pricing-estimates.service";
import { pricingRates } from "./pricing-currency.service";
import { publishedPriceBook } from "../pricing/price-books";
const actor = (id = "partner", extra: string[] = [], global = false) => ({ id, role: { id: global ? "admin-role" : "sales-role", name: global ? "Admin" : "Sales", isSystem: true }, permissions: [P.PRICING_VIEW, P.PRICING_ESTIMATES_CREATE, P.COMPANIES_VIEW, ...extra] } as AuthUser);
const admin = actor("admin", [P.PRICING_PRICEBOOKS_MANAGE, P.PRICING_ESTIMATES_VIEW_ALL], true);
const run = <T>(who: AuthUser, work: () => T) => marketContext.run({ actor: () => who }, work);
const configuration = { configurationVersion: 1 as const, product: "erp" as const, modules: ["erp-core"], addons: [], customModuleTier: [], customSoftwareTier: null, customNotes: "" };
const reference = { id: "JO" as const, version: PRICING_CATALOG_VERSION, structureVersion: PRODUCT_STRUCTURE_VERSION };
const input = { title: "Native fixture", notes: "", companyId: null, configuration, priceBook: reference };
function setup(t: TestContext) { assert.equal(new URL(env.DATABASE_URL).port, "1"); const mode = env.PRICING_MODE; env.PRICING_MODE = "price_books"; t.after(() => { env.PRICING_MODE = mode; }); return installMarketStore(t); }
const grant = (id: string, bookIds: string[], defaultBookId: string | null) => run(admin, () => replaceUserPriceBookAccess(id, { scope: "selected", bookIds, defaultBookId }, admin));
test("price-book defaults/grants are atomic, International is exactly three explicit grants, and market/session/ownership state stays unchanged", async (t) => {
    const f = setup(t);
    const protectedRows = structuredClone({ users: f.tables.user, markets: f.tables.userSalesMarket, companies: f.tables.company, opportunities: f.tables.opportunity });
    const result = await run(admin, () => replaceUserPriceBookAccess("partner", { scope: "international", defaultBookId: "UK" }, admin));
    assert.deepEqual(result.bookIds, ["JO", "US", "UK"]);
    assert.deepEqual(effectivePriceBookIds(replacePriceBookAccessSchema.parse({ scope: "international", defaultBookId: "JO" })), ["JO", "US", "UK"]);
    assert.equal((await run(actor(), () => listAuthorizedPriceBooks(actor()))).defaultBookId, "UK");
    assert.equal((await run(actor(),()=>getAuthorizedPriceBookPrices(actor()))).currency,"GBP");
    assert.equal((await run(admin, () => getUserPriceBookAccess("partner", admin))).grants.length, 3);
    assert.deepEqual({ users: f.tables.user, markets: f.tables.userSalesMarket, companies: f.tables.company, opportunities: f.tables.opportunity }, protectedRows);
    assert.equal(f.calls.some(c => c.model === "session"), false);
    const before = structuredClone({ grants: f.tables.priceBookGrant, prefs: f.tables.userPricingPreference });
    f.setAuditOutage(true);
    await assert.rejects(grant("partner", ["JO"], "JO"));
    assert.deepEqual({ grants: f.tables.priceBookGrant, prefs: f.tables.userPricingPreference }, before);
    f.setAuditOutage(false);
    await assert.rejects(grant("partner", ["JO"], "UK"));
    assert.deepEqual({ grants: f.tables.priceBookGrant, prefs: f.tables.userPricingPreference }, before);
    for (const who of [actor("admin", [], true), actor("partner", [P.PRICING_PRICEBOOKS_MANAGE])])
        await assert.rejects(run(who, () => replaceUserPriceBookAccess("partner", { scope: "selected", bookIds: [], defaultBookId: null }, who)), { status: 403 });
});
test("native prices authorize explicit books before publication lookup; default markets and global Admin never imply book access", async (t) => {
    setup(t);
    await assert.rejects(run(actor(), () => prisma.priceBookGrant.findMany({ select: { user: true } })), { status: 403 });
    await assert.rejects(run(admin, () => prisma.userPricingPreference.findMany({ select: { user: true } })), { status: 403 });
    assert.deepEqual((await run(actor(), () => listAuthorizedPriceBooks(actor()))).books, []);
    for (const who of [actor(), actor("admin", [], true)])
        await assert.rejects(run(who, () => getAuthorizedPriceBookPrices(who, "JO")), { status: 403 });
    await grant("partner", ["JO", "UK"], "JO");
    const who = actor();
    assert.equal((await run(who, () => getAuthorizedPriceBookPrices(who, "JO"))).products[0]?.quote.amount, 750);
    assert.equal((await run(who, () => getAuthorizedPriceBookPrices(who))).currency, "JOD");
    await assert.rejects(run(who, () => getAuthorizedPriceBookPrices(who, "US")), { status: 403 });
    assert.equal((await run(who,()=>getAuthorizedPriceBookPrices(who,"UK"))).products[0]?.quote.amount,1100);await assert.rejects(run(who,()=>getAuthorizedPriceBookPrices(who,"UK","not-approved")),{status:503,code:"PRICE_BOOK_UNPUBLISHED"});
    await assert.rejects(run({ ...who, permissions: [] }, () => getAuthorizedPriceBookPrices({ ...who, permissions: [] }, "JO")), { status: 403 });
    assert.equal((await run(who, () => calculateAuthorizedPriceBook(who, { configuration, priceBook: reference }))).estimatedTotal, 750);
});
test("native immutable snapshots enforce book, creator and company scopes; historical FX reads never reprice", async (t) => {
    const f = setup(t);
    await grant("partner", ["JO"], "JO");
    await grant("uk", ["UK"], "UK");
    t.mock.method(pricingRates, "get", async () => { throw new Error("Native calculations/read must not call FX"); });
    const saved = await run(actor(), () => createPricingEstimate(input));
    assert.equal(saved.currency, "JOD");
    assert.equal((saved.result as {
        pricingBasis: string;
    }).pricingBasis, "PRICE_BOOK");
    assert.equal(f.tables.pricingEstimateBook!.length, 1);
    const snapshot = structuredClone(f.tables.pricingEstimate);
    assert.equal((await run(admin, () => listPricingEstimates({ page: 1, pageSize: 20, search: "", scope: "all" }))).total, 0);
    const broad = actor("uk", [P.PRICING_ESTIMATES_VIEW_ALL]);
    await assert.rejects(run(broad, () => getPricingEstimate(saved.id)), { status: 404 });
    await assert.rejects(run(actor(), () => createPricingEstimate({ ...input, companyId: "c1" })), /Company not found/);
    assert.deepEqual(f.tables.pricingEstimate, snapshot);
    await assert.rejects(run(actor(), () => createPricingEstimate({ ...input, displayCurrency: "USD" })));
    await assert.rejects(run(actor(), () => createPricingEstimate({ ...input, priceBook: undefined, configuration: { ...configuration, catalogVersion: PRICING_CATALOG_VERSION } })), { status: 409 });
    // Retained historical conversion fixture: display currency is GBP, commercial origin remains JO.
    f.tables.pricingEstimate!.push({ id: "legacy-fx", createdById: "partner", companyId: null, title: "Retained FX", notes: "", currency: "JOD", catalogVersion: PRICING_CATALOG_VERSION, configurationVersion: 1, calculationVersion: "cheapest-preset-v1", selection: { ...configuration, catalogVersion: PRICING_CATALOG_VERSION }, result: { currency: "JOD", estimatedTotal: 750, conversion: { exchange: { currency: "GBP", rate: 1.1 }, result: { currency: "GBP", estimatedTotal: 825 } } }, createdAt: new Date() });
    const historic = structuredClone(f.tables.pricingEstimate!.at(-1));
    assert.deepEqual((await run(actor(), () => getPricingEstimate("legacy-fx"))).result, historic!.result);
    await assert.rejects(run(broad, () => getPricingEstimate("legacy-fx")), { status: 404 });
    const copy = await run(actor(), () => copyPricingEstimate(saved.id, { ...input, title: "Native copy" }));
    assert.notEqual(copy.id, saved.id);
    assert.deepEqual(f.tables.pricingEstimate![0], snapshot![0]);
    await grant("partner", [], null);
    await assert.rejects(run(actor(), () => getPricingEstimate(saved.id)), { status: 404 });
    assert.equal((await run(actor(), () => listPricingEstimates({ page: 1, pageSize: 20, search: "", scope: "all" }))).total, 0);
});
test("staged mode and storage outages fail closed without fallback or authentication changes", async (t) => {
    const f = setup(t);
    env.PRICING_MODE = "legacy_fx";
    await assert.rejects(run(actor(), () => listAuthorizedPriceBooks(actor())), { status: 503, code: "PRICE_BOOK_ROLLOUT_PENDING" });
    assert.equal(f.calls.length, 0);
    env.PRICING_MODE = "price_books";
    f.setOutage(true);
    await assert.rejects(run(actor(), () => listAuthorizedPriceBooks(actor())), { status: 503 });
});
test("zero-market accounts may save standalone native estimates with explicit grants, but cannot link inaccessible companies", async (t) => { setup(t); await grant("unassigned", ["JO"], "JO"); const who = actor("unassigned"); const saved = await run(who, () => createPricingEstimate(input)); assert.equal(saved.companyId, null); await assert.rejects(run(who, () => createPricingEstimate({ ...input, companyId: "c0" })), /Company not found/); });

test("Draft v1 US/UK saves and explicit immutable copies use native snapshots; cross-book save/copy/list/detail fail closed", async t => {
  const f = setup(t); await grant("partner", ["JO", "US", "UK"], "US");
  const who = actor();
  const companiesBefore = structuredClone(f.tables.company);
  const us = publishedPriceBook("US");
  const usReference = { id: "US", version: us.version, structureVersion: us.structureVersion };
  // A USD estimate may link a visible Jordan company; a US book grant never grants UK company visibility.
  assert.equal((await run(who, () => createPricingEstimate({ ...input, companyId: "c0", priceBook: usReference }))).currency, "USD");
  await assert.rejects(run(who, () => createPricingEstimate({ ...input, companyId: "c1", priceBook: usReference })), /Company not found/);
  assert.deepEqual(f.tables.company, companiesBefore);
  const saved = [];
  for (const id of ["US", "UK"] as const) {
    const book = publishedPriceBook(id);
    const priceBook = { id, version: book.version, structureVersion: book.structureVersion };
    const row = await run(who, () => createPricingEstimate({ ...input, priceBook })); saved.push(row);
    assert.equal(row.currency, book.currency);
    const snapshot = row.result as { estimatedTotal: number; priceBook: { reviewStatus: string; publiclyApproved: boolean }; conversion?: unknown };
    assert.equal(snapshot.estimatedTotal, id === "US" ? 1500 : 1100); assert.equal(snapshot.priceBook.reviewStatus, "draft_v1"); assert.equal(snapshot.priceBook.publiclyApproved, false); assert.equal(snapshot.conversion, undefined);
    const copy = await run(who, () => copyPricingEstimate(row.id, { ...input, title: "Explicit native copy", priceBook }));
    assert.notEqual(copy.id, row.id); assert.deepEqual(copy.result, row.result);
  }
  const before = structuredClone(f.tables.pricingEstimate);
  await grant("partner", ["JO"], "JO");
  for (const row of saved) {
    const book = publishedPriceBook(row.currency === "USD" ? "US" : "UK");
    const priceBook = { id: book.id, version: book.version, structureVersion: book.structureVersion };
    await assert.rejects(run(who, () => createPricingEstimate({ ...input, priceBook })), { status: 403 });
    await assert.rejects(run(who, () => copyPricingEstimate(row.id, input)), { status: 404 });
    await assert.rejects(run(who, () => getPricingEstimate(row.id)), { status: 404 });
  }
  assert.equal((await run(who, () => listPricingEstimates({ page: 1, pageSize: 20, search: "", scope: "all" }))).total, 0);
  assert.deepEqual(f.tables.pricingEstimate, before);
});
