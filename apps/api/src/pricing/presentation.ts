// Authenticated presentation only. Never import this catalog into a client bundle.
import { PRICING_CATALOG_VERSION, PRICING_CONFIGURATION_VERSION, PRICING_PRODUCTS, type PricingRequest } from "@nbs/shared";
import { addonGroups, addons, allModules, customModuleTiers, customSoftwareTiers, erpModuleGroups, presets } from "./catalog";
import { calculatePricing, getPricingCatalog } from "./engine";

function productStart(product: PricingRequest["product"]) {
  const metadata = getPricingCatalog().data;
  const base: PricingRequest = { product, configurationVersion: metadata.configurationVersion, catalogVersion: metadata.catalogVersion,
    modules: metadata.modules.filter(item => item.product === product && item.required).map(item => item.id), addons: [], customModuleTier: [], customSoftwareTier: null, customNotes: "" };
  const configurations = product === "custom" ? metadata.customSoftwareTiers.map(tier => ({ ...base, customSoftwareTier: tier })) : [base];
  const candidates = configurations.map(configuration => ({ configuration, result: calculatePricing(configuration).data }));
  candidates.sort((a, b) => a.result.estimatedTotal - b.result.estimatedTotal || String(a.configuration.customSoftwareTier).localeCompare(String(b.configuration.customSoftwareTier), "en"));
  const initial = candidates[0];
  if (!initial) throw new Error("Missing product starting configuration.");
  return { id: product, quote: { kind: "starting_from" as const, amount: initial.result.estimatedTotal }, initialConfiguration: initial.configuration,
    noteKey: product === "custom" ? "fromFocused" : "fromCore",
    typicalQuote: null };
}

export function getPricingPrices() {
  return { data: {
    catalogVersion: PRICING_CATALOG_VERSION, configurationVersion: PRICING_CONFIGURATION_VERSION, currency: "JOD" as const,
    products: PRICING_PRODUCTS.map(productStart),
    modules: allModules.map(item => ({ id: item.id, quote: item.quote })),
    presets: presets.map(item => ({ id: item.id, quote: { kind: "exact" as const, amount: item.presetPrice }, componentTotal: item.componentTotal, savings: item.componentTotal - item.presetPrice })),
    addons: addons.map(item => ({ id: item.id, quote: item.quote })),
    customModuleTiers: Object.entries(customModuleTiers).map(([id, item]) => ({ id, quote: item.quote })),
    customSoftwareTiers: Object.entries(customSoftwareTiers).map(([id, item]) => ({ id, quote: item.quote })),
    moduleGroups: erpModuleGroups.map(group => ({ id: group.id, ids: [...group.moduleIds] })),
    addonGroups: addonGroups.map(group => ({ id: group.id, ids: [...group.addonIds] })),
  } };
}
