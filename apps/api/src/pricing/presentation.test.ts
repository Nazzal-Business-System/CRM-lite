import assert from "node:assert/strict";
import test from "node:test";
import { addons, allModules, customModuleTiers, customSoftwareTiers, presets } from "./catalog";
import { getPricingPrices } from "./presentation";
import { calculatePricing, getPricingCatalog } from "./engine";

test("authenticated price view faithfully presents every approved catalog amount and existing savings", () => {
  const view = getPricingPrices().data; const metadata = getPricingCatalog().data;
  for (const product of view.products) {
    assert.equal(product.quote.amount, calculatePricing(product.initialConfiguration).data.estimatedTotal);
    assert.equal(product.initialConfiguration.product, product.id);
    assert.equal(product.typicalQuote, null);
  }
  assert.equal(view.products.find(item => item.id === "erp")?.quote.amount, 750);
  assert.equal(view.products.find(item => item.id === "erp")?.typicalQuote, null);
  assert.equal(view.products.find(item => item.id === "custom")?.initialConfiguration.customSoftwareTier, "focused-workflow");
  for (const [items, source] of [[view.modules, allModules], [view.addons, addons], [view.customModuleTiers, Object.entries(customModuleTiers).map(([id, item]) => ({ id, ...item }))], [view.customSoftwareTiers, Object.entries(customSoftwareTiers).map(([id, item]) => ({ id, ...item }))]] as const) {
    assert.equal(items.length, source.length);
    for (const item of items) assert.deepEqual(item.quote, source.find(entry => entry.id === item.id)?.quote);
  }
  for (const item of view.presets) { const source = presets.find(entry => entry.id === item.id)!; assert.equal(item.quote.amount, source.presetPrice); assert.equal(item.savings, source.componentTotal - source.presetPrice); }
  assert.equal(view.catalogVersion, metadata.catalogVersion); assert.equal(view.currency, "JOD");
  assert.equal(new Set(view.moduleGroups.flatMap(group => group.ids)).size, view.moduleGroups.flatMap(group => group.ids).length);
  assert.deepEqual([...view.addonGroups.flatMap(group => group.ids)].sort(), metadata.addons.map(item => item.id).sort());
});
