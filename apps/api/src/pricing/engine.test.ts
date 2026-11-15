import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { PRICING_ADDON_IDS, PRICING_CATALOG_VERSION, PRICING_CUSTOM_MODULE_IDS, PRICING_CUSTOM_SOFTWARE_IDS, PRICING_MODULE_DEPENDENCIES, PRICING_MODULE_IDS, pricingRequestSchema, type PricingRequest } from "@nbs/shared";
import { calculatePricing, chooseCheapestCandidate, getPricingCatalog } from "./engine";
import { addons, allModules, customModuleTiers, customSoftwareTiers, erpModules, moduleById, presets } from "./catalog";
import { applyPreset, calculateEstimate as websiteEstimate } from "./__fixtures__/website-calculate";
import { getDependencyPrompt, removeModuleCascading } from "./dependencies";
import type { ModuleId, SelectionState } from "./types";

const request = (patch: Partial<PricingRequest> = {}): PricingRequest => ({ configurationVersion: 1, catalogVersion: PRICING_CATALOG_VERSION, product: "erp", modules: ["erp-core"], addons: [], customModuleTier: [], customSoftwareTier: null, customNotes: "", ...patch });
const website = (value: PricingRequest): SelectionState => ({ ...value, presetId: null });
const fromPreset = (id: string) => {
  const preset = presets.find(p => p.id === id)!;
  return request({ product: preset.product, modules: [...preset.moduleIds] });
};

test("catalog amounts/types retain recorded website provenance; shared metadata matches identifiers/dependencies", () => {
  const manifest = JSON.parse(readFileSync(new URL("./source-provenance.json", import.meta.url), "utf8")) as { sha256Lf: Record<string, string> };
  const hashLf = (text: string) => createHash("sha256").update(text.replaceAll("\r\n", "\n")).digest("hex");
  for (const file of ["catalog.ts", "types.ts"]) assert.equal(hashLf(readFileSync(new URL(file, import.meta.url), "utf8")), manifest.sha256Lf[file]);
  const reference = readFileSync(new URL("./__fixtures__/website-calculate.ts", import.meta.url), "utf8")
    .replaceAll('from "../catalog"', 'from "./catalog"').replaceAll('from "../types"', 'from "./types"')
    .replace('const preset = presetById[activePreset]!; // CRM strict indexed-access typing; no runtime change.', 'const preset = presetById[activePreset];');
  assert.equal(hashLf(reference), manifest.sha256Lf["calculate.ts"]);
  assert.deepEqual([...PRICING_MODULE_IDS].sort(), allModules.map(m => m.id).sort());
  assert.deepEqual([...PRICING_ADDON_IDS].sort(), addons.map(a => a.id).sort());
  assert.deepEqual([...PRICING_CUSTOM_MODULE_IDS].sort(), Object.keys(customModuleTiers).sort());
  assert.deepEqual([...PRICING_CUSTOM_SOFTWARE_IDS].sort(), Object.keys(customSoftwareTiers).sort());
  for (const item of allModules) assert.deepEqual(PRICING_MODULE_DEPENDENCIES[item.id as ModuleId] ?? [], item.requires ?? []);
  for (const preset of presets) assert.equal(preset.componentTotal, preset.moduleIds.reduce((sum, id) => sum + (moduleById[id].quote as { amount: number }).amount, 0));
});

test("unchanged preset prices, core pricing, POS bundle and single-session training match website", () => {
  for (const preset of presets) {
    const input = fromPreset(preset.id);
    assert.equal(calculatePricing(input).data.estimatedTotal, preset.presetPrice);
    assert.equal(calculatePricing(input).data.estimatedTotal, websiteEstimate(applyPreset(preset.product, preset.id)).estimatedTotal);
  }
  for (const input of [request(), request({ modules: ["erp-core", "erp-inventory"] }), request({ product: "pos", modules: ["pos-core"], addons: ["staff-training"] }), request({ product: "ims", modules: ["ims-core", "ims-import-export"] })]) {
    assert.equal(calculatePricing(input).data.estimatedTotal, websiteEstimate(website(input)).estimatedTotal);
  }
  const training = calculatePricing(request({ product: "pos", modules: ["pos-core"], addons: ["staff-training"] })).data;
  assert.equal(training.estimatedTotal, 750); assert.equal(training.hasStartingFromItems, true);
  assert.deepEqual(training.lineItems.find(l => l.id === "staff-training")?.quote, { kind: "per_session", amount: 100 });
});

test("all add-ons/custom tiers retain amounts, additive distinct tier rules and minimum-price flags", () => {
  for (const addon of addons) {
    const input = request({ addons: [addon.id] });
    assert.equal(calculatePricing(input).data.estimatedTotal, websiteEstimate(website(input)).estimatedTotal);
    assert.equal(calculatePricing(input).data.hasStartingFromItems, true);
  }
  for (const software of PRICING_CUSTOM_SOFTWARE_IDS) {
    const input = request({ product: "custom", modules: [], customSoftwareTier: software, customModuleTier: [...PRICING_CUSTOM_MODULE_IDS] });
    assert.equal(calculatePricing(input).data.estimatedTotal, websiteEstimate(website(input)).estimatedTotal);
    assert.equal(calculatePricing(input).data.hasStartingFromItems, true);
  }
  const input = request({ customModuleTier: [...PRICING_CUSTOM_MODULE_IDS] });
  assert.equal(calculatePricing(input).data.estimatedTotal, websiteEstimate(website(input)).estimatedTotal);
});

test("approved differences: ERP Operations preference never prevents the cheapest Business bundle", () => {
  const business = fromPreset("erp-business");
  assert.equal(websiteEstimate({ ...website(business), presetId: "erp-operations" }).estimatedTotal, 3700);
  const result = calculatePricing(business).data;
  assert.equal(result.estimatedTotal, 3600); assert.equal(result.presetApplied, "erp-business");
  const operationsExtra = fromPreset("erp-operations"); operationsExtra.modules.push("erp-crm");
  assert.equal(websiteEstimate(website(operationsExtra)).estimatedTotal, 2850);
  assert.equal(calculatePricing(operationsExtra).data.estimatedTotal, 2700);
  const businessExtra = { ...business, modules: [...business.modules, "erp-crm" as const] };
  assert.equal(calculatePricing(businessExtra).data.estimatedTotal, 3950);
  assert.equal(calculatePricing(businessExtra).data.presetApplied, "erp-business");
});

test("cheapest selection compares component pricing and ties use preset then ASCII ID", () => {
  const candidate = (id: "erp-business" | "erp-operations" | null, total: number) => ({ id, total, coveredModules: id ? 1 : 0, lines: [] });
  const cases = [candidate("erp-operations", 10), candidate("erp-business", 10), candidate(null, 10)];
  assert.equal(chooseCheapestCandidate(cases).id, "erp-business");
  assert.equal(chooseCheapestCandidate([...cases].reverse()).id, "erp-business");
  assert.equal(chooseCheapestCandidate([...cases, candidate(null, 9)]).id, null);
  assert.equal(calculatePricing(fromPreset("pos-management")).data.presetApplied, "pos-management");
});

test("all valid ERP module subsets satisfy the independent minimum-price oracle and item sums", () => {
  const optional = erpModules.map(m => m.id as ModuleId).filter(id => id !== "erp-core");
  let checked = 0;
  for (let mask = 0; mask < 2 ** optional.length; mask++) {
    const modules: ModuleId[] = ["erp-core", ...optional.filter((_id, bit) => mask & (1 << bit))];
    const input = request({ modules }); if (!pricingRequestSchema.safeParse(input).success) continue;
    const component = modules.reduce((sum, id) => sum + (moduleById[id].quote as { amount: number }).amount, 0);
    const totals = presets.filter(p => p.product === "erp" && p.moduleIds.every(id => modules.includes(id))).map(p => p.presetPrice + modules.filter(id => !p.moduleIds.includes(id)).reduce((sum, id) => sum + (moduleById[id].quote as { amount: number }).amount, 0));
    const actual = calculatePricing(input).data;
    assert.equal(actual.estimatedTotal, Math.min(component, ...totals));
    assert.equal(actual.lineItems.reduce((sum, item) => sum + item.amount, 0), actual.estimatedTotal);
    assert.equal(actual.componentOnlyTotal - actual.bundleSavings, actual.estimatedTotal);
    checked++;
  }
  assert.ok(checked > 1000);
});

test("dependencies retain both Operations paths, recommendations remain optional, removal cascades", () => {
  for (const fulfillment of ["erp-sales", "erp-procurement"] as const) {
    const modules: ModuleId[] = ["erp-core", "erp-inventory", "erp-operations", fulfillment];
    assert.equal(getDependencyPrompt("erp-operations", modules), null);
    assert.doesNotThrow(() => calculatePricing(request({ modules })));
  }
  assert.doesNotThrow(() => calculatePricing(request({ modules: ["erp-core", "erp-finance"] })));
  assert.deepEqual(removeModuleCascading([...fromPreset("erp-operations").modules], "erp-inventory"), ["erp-core"]);
});

test("every valid POS/IMS subset uses the minimum valid bundle without changing commercial amounts", () => {
  for (const product of ["pos", "ims"] as const) {
    const options = allModules.filter(m => m.product === product).map(m => m.id as ModuleId);
    for (let mask = 0; mask < 2 ** options.length; mask++) {
      const modules = options.filter((_id, index) => mask & (1 << index));
      const input = request({ product, modules }); if (!pricingRequestSchema.safeParse(input).success) continue;
      const actual = calculatePricing(input).data;
      const component = modules.reduce((sum, id) => sum + (moduleById[id].quote as { amount: number }).amount, 0);
      const totals = presets.filter(p => p.product === product && p.moduleIds.every(id => modules.includes(id))).map(p => p.presetPrice + modules.filter(id => !p.moduleIds.includes(id)).reduce((sum, id) => sum + (moduleById[id].quote as { amount: number }).amount, 0));
      assert.equal(actual.estimatedTotal, Math.min(component, ...totals));
      assert.ok(actual.estimatedTotal <= websiteEstimate(website(input)).estimatedTotal);
    }
  }
});

test("strict input rejects unsupported, forged, duplicate, incompatible and incomplete configurations", () => {
  const invalid = [null, [], {}, { ...request(), configurationVersion: 2 }, { ...request(), catalogVersion: "old" },
    ...["estimatedTotal", "claimedEstimate", "quote", "discount", "price", "currency", "presetId", "companyId", "__proto__"].map(key => JSON.parse(JSON.stringify(request()).slice(0, -1) + `,${JSON.stringify(key)}:0}`)),
    { ...request(), product: "bogus" }, { ...request(), modules: ["erp-core", "pos-core"] }, { ...request(), modules: [] },
    { ...request(), modules: ["erp-core", "erp-procurement"] }, { ...request(), modules: ["erp-core", "erp-inventory", "erp-operations"] },
    { ...request(), modules: ["erp-core", "erp-ess"] }, { ...request(), modules: ["erp-core", "unknown"] },
    { ...request(), modules: ["erp-core", "erp-core"] }, { ...request(), addons: ["staff-training", "staff-training"] },
    { ...request(), customModuleTier: ["focused-module", "focused-module"] }, { ...request(), customModuleTier: ["unknown"] },
    { ...request(), addons: ["unknown"] }, { ...request(), addons: Array(12).fill("staff-training") },
    { ...request(), customNotes: "a".repeat(2001) }, { ...request(), customNotes: {} },
    { ...request(), product: "custom", modules: [] }, { ...request(), customSoftwareTier: "focused-workflow" },
    { ...request(), product: "custom", customSoftwareTier: "focused-workflow" }, { ...request(), customSoftwareTier: "unknown" },
  ];
  for (const [index, input] of invalid.entries()) assert.throws(() => calculatePricing(input), `Invalid case ${index} must fail`);
  const ordered = request({ modules: [...fromPreset("erp-business").modules], addons: ["staff-training", "data-migration"] });
  assert.deepEqual(calculatePricing(ordered), calculatePricing({ ...ordered, modules: [...ordered.modules].reverse(), addons: [...ordered.addons].reverse() }));
});

test("catalog API view contains identifiers/dependencies but no numeric pricing or quote fields", () => {
  const data = getPricingCatalog();
  assert.equal(/"(amount|quote|presetPrice|componentTotal|publicStartingPrices)"/.test(JSON.stringify(data)), false);
  assert.equal(data.data.catalogVersion, PRICING_CATALOG_VERSION);
  assert.deepEqual(data.data.modules.find(m => m.id === "erp-operations")?.requiresAnyOf, ["erp-procurement", "erp-sales"]);
});
