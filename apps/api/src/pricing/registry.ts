import { PRICING_CATALOG_VERSION, pricingRequestSchema } from "@nbs/shared";
import { calculatePricing } from "./engine";

export const PRICING_CALCULATION_VERSION = "cheapest-preset-v1" as const;
// Keep entries and their implementation/schema intact when future catalogs are added.
// Reads never consult this registry or recalculate historical snapshots.
export const pricingVersions = Object.freeze({
  [PRICING_CATALOG_VERSION]: Object.freeze({ calculationVersion: PRICING_CALCULATION_VERSION, schema: pricingRequestSchema, calculate: calculatePricing }),
});
export function calculateSavedSelection(raw: unknown) {
  const parsed = pricingRequestSchema.parse(raw);
  const version = pricingVersions[parsed.catalogVersion];
  const selection = { ...parsed, modules: [...parsed.modules].sort(), addons: [...parsed.addons].sort(), customModuleTier: [...parsed.customModuleTier].sort() };
  return { selection, result: version.calculate(selection).data, calculationVersion: version.calculationVersion };
}
