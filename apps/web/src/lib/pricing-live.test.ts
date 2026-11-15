import assert from "node:assert/strict";
import test from "node:test";
import { isCurrentPricing, schedulePricing, type LivePricingState } from "./pricing-live";
import { assertPricingVersions, emptyPricingConfiguration, planPricingModuleChange, pricingPricesOptions, type EstimateSnapshot, type PricingCatalog, type PricingPrices } from "./pricing";

const estimate = { currency: "JOD", catalogVersion: "fixture", configurationVersion: 1, estimatedTotal: 7, componentOnlyTotal: 9, bundleSavings: 2, presetApplied: null, hasStartingFromItems: false, hasCustomQuotationItems: false, lineItems: [] } satisfies EstimateSnapshot;
const tick = () => new Promise(resolve => setTimeout(resolve, 5));
test("live calculation debounces changes, ignores late responses, and retains a labelled previous result", async () => {
  let state: LivePricingState = { key: "old", status: "success", estimate, error: null }; const publish = (value: Partial<LivePricingState>) => { state = { ...state, ...value }; };
  let calls = 0; const canceled = schedulePricing("canceled", async () => { calls++; return { estimate }; }, publish, 100); canceled();
  let resolveOld!: (value: { estimate: EstimateSnapshot }) => void;
  const stopOld = schedulePricing("slow", () => { calls++; return new Promise(resolve => { resolveOld = resolve; }); }, publish, 0);
  await tick(); assert.equal(calls, 1); assert.equal(state.estimate, estimate); assert.equal(isCurrentPricing(state, "slow"), false);
  stopOld(); const fresh = { ...estimate, estimatedTotal: 12 };
  const stop = schedulePricing("new", async () => { calls++; return { estimate: fresh }; }, publish, 0);
  await tick(); assert.equal(isCurrentPricing(state, "new"), true); assert.equal(state.estimate, fresh);
  resolveOld({ estimate }); await tick(); assert.equal(state.estimate, fresh); assert.equal(state.key, "new"); stop();
  assert.equal(isCurrentPricing(state, null), false); assert.equal(isCurrentPricing(state, "changed"), false);
});
test("live failure preserves last result, disables saving, and recovers on retry", async () => {
  let state: LivePricingState = { key: "config", status: "success", estimate, error: null }; const publish = (value: Partial<LivePricingState>) => { state = { ...state, ...value }; };
  const stop = schedulePricing("config", async () => { throw new Error("fixture outage"); }, publish, 0);
  await tick(); assert.equal(state.status, "error"); assert.equal(state.estimate, estimate); assert.equal(isCurrentPricing(state, "config"), false); stop();
  const recovered = schedulePricing("config", async () => ({ estimate }), publish, 0); await tick(); assert.equal(isCurrentPricing(state, "config"), true); recovered();
});
test("price lookup requires pricing permission and mismatched catalog versions/items fail closed", async () => {
  await assert.rejects(pricingPricesOptions(null).queryFn(), { status: 403 });
  const catalog = { catalogVersion: "one", configurationVersion: 1, currency: "JOD", products: [], modules: [], presets: [], addons: [], customModuleTiers: [], customSoftwareTiers: [] } as unknown as PricingCatalog;
  const prices: PricingPrices = { ...catalog, products: [], modules: [], presets: [], addons: [], customModuleTiers: [], customSoftwareTiers: [], moduleGroups: [], addonGroups: [] };
  assert.doesNotThrow(() => assertPricingVersions(catalog, prices));
  assert.throws(() => assertPricingVersions(catalog, { ...prices, catalogVersion: "other" }));
  assert.throws(() => assertPricingVersions(catalog, { ...prices, modules: [{ id: "forged", quote: { kind: "exact", amount: 1 } }] }));
});
test("dependency plans expose additions, removal consequences and Operations alternatives before committing", () => {
  const catalog = { configurationVersion: 1, catalogVersion: "fixture", modules: [
    { id: "erp-core", product: "erp", required: true, requires: [], requiresAnyOf: [] },
    { id: "erp-inventory", product: "erp", required: false, requires: [], requiresAnyOf: [] },
    { id: "erp-sales", product: "erp", required: false, requires: ["erp-inventory"], requiresAnyOf: [] },
    { id: "erp-procurement", product: "erp", required: false, requires: ["erp-inventory"], requiresAnyOf: [] },
    { id: "erp-operations", product: "erp", required: false, requires: ["erp-inventory"], requiresAnyOf: ["erp-sales", "erp-procurement"] },
  ] } as unknown as PricingCatalog;
  const config = emptyPricingConfiguration(catalog, "erp"); const planned = planPricingModuleChange(catalog, config.modules, "erp-operations", true);
  assert.deepEqual(config.modules, ["erp-core"]); assert.deepEqual(planned.added, ["erp-inventory"]); assert.deepEqual(planned.alternatives, ["erp-sales", "erp-procurement"]);
  const removal = planPricingModuleChange(catalog, ["erp-core", "erp-inventory", "erp-sales", "erp-operations"], "erp-inventory", false);
  assert.deepEqual(new Set(removal.removed), new Set(["erp-sales", "erp-operations"])); assert.deepEqual(removal.modules, ["erp-core"]);
});
