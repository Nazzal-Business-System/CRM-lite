import assert from "node:assert/strict";
import test from "node:test";
import { PRICING_CATALOG_VERSION, type AuthUser } from "@nbs/shared";
import { initialPricingCurrency, pricingCalculationOptions, savedDisplaySnapshot, savedEstimateSchema, configurationForCopy, type PricingCatalog, pricingErrorKey, pricingPricesOptions } from "./pricing";
import { ApiError } from "./api";
const actor = { id: "fixture", permissions: ["pricing.view"] } as AuthUser;
const configuration = { configurationVersion: 1, catalogVersion: PRICING_CATALOG_VERSION, product: "erp", modules: ["erp-core"], addons: [], customModuleTier: [], customSoftwareTier: null, customNotes: "" };
const base = { currency: "JOD", catalogVersion: PRICING_CATALOG_VERSION, configurationVersion: 1, estimatedTotal: 750, componentOnlyTotal: 750, bundleSavings: 0, presetApplied: null, hasStartingFromItems: false, hasCustomQuotationItems: false, lineItems: [] };
const exchange = { version: "fx-line-half-up-v1", base: "JOD", currency: "GBP", rate: 1.25, source: "Frankfurter v2", sourceUrl: "https://frankfurter.dev/", effectiveDate: "2026-11-14", retrievedAt: "2026-11-14T12:00:00.000Z", expiresAt: "2026-11-14T18:00:00.000Z" };
test("market defaults, manual currency requests and historical snapshots stay independent", async t => {
  assert.deepEqual(["JO", "UK", "US", "OTHER"].map(defaultMarketCode => initialPricingCurrency({ ...actor, defaultMarketCode })), ["JOD", "GBP", "USD", "USD"]);
  assert.equal(initialPricingCurrency(null), "JOD");
  const calls: Array<{ path: string; body: unknown }> = [];
  t.mock.method(globalThis, "fetch", async (path: string, init: RequestInit) => { calls.push({ path, body: JSON.parse(init.body as string) }); return Response.json({ data: { ...base, currency: "GBP", estimatedTotal: 937.5, exchange } }); });
  const original = structuredClone(actor); const result = await pricingCalculationOptions(actor, "GBP").mutationFn(configuration);
  assert.equal(result.estimate.currency, "GBP"); assert.equal(calls[0]?.path, "/api/pricing/calculate-converted"); assert.deepEqual(calls[0]?.body, { configuration, currency: "GBP" }); assert.deepEqual(actor, original);
  const historic = { ...base, conversion: { exchange, result: { ...base, currency: "GBP", estimatedTotal: 937.5 } } };
  assert.equal(savedDisplaySnapshot(historic)?.estimatedTotal, 937.5); assert.equal(savedDisplaySnapshot(base)?.currency, "JOD");
  assert.equal(savedDisplaySnapshot({ ...historic, conversion: { exchange, result: base } }), null);
  assert.equal(pricingErrorKey(new ApiError(503, "EXCHANGE_RATES_STALE", "fixture")), "pricing.ratesUnavailable");
  await assert.rejects(pricingCalculationOptions(null, "GBP").mutationFn(configuration), { status: 403 });
  await assert.rejects(pricingPricesOptions(null, "USD").queryFn(), { status: 403 }); assert.equal(calls.length, 1);
});
test("converted response currency mismatch is recoverable and cannot be saved as a valid result", async t => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ data: base }));
  await assert.rejects(pricingCalculationOptions(actor, "GBP").mutationFn(configuration), { status: 503, code: "EXCHANGE_RATES_UNAVAILABLE" });
});

test("native snapshots retain book identity and never become legacy FX copies or converted labels",()=>{
 const priceBook={id:"UK",version:"isolated-native-history",structureVersion:"retained-structure-v1"};const snapshot={...base,currency:"GBP",catalogVersion:priceBook.version,pricingBasis:"PRICE_BOOK",priceBook,estimatedTotal:101};
 assert.equal(savedDisplaySnapshot(snapshot)?.estimatedTotal,101);assert.equal(savedDisplaySnapshot(snapshot)?.priceBook?.id,"UK");assert.equal(savedDisplaySnapshot({...snapshot,currency:"USD"}),null);assert.equal(savedDisplaySnapshot({...snapshot,conversion:{exchange,result:base}}),null);
 const record=savedEstimateSchema.parse({id:"native",createdById:"fixture",companyId:null,title:"Native history",notes:"",currency:"GBP",catalogVersion:priceBook.version,calculationVersion:"cheapest-preset-v1",configurationVersion:1,selection:configuration,result:snapshot,createdAt:"2026-11-14T00:00:00Z"});
 assert.equal(configurationForCopy(record,{catalogVersion:priceBook.version,configurationVersion:1} as PricingCatalog),null);
 assert.equal(savedDisplaySnapshot({...base,conversion:{exchange,result:{...base,currency:"GBP"}}})?.exchange?.currency,"GBP");
});
