// Server-only: never re-export this module or its priced catalog from @nbs/shared.
import { z } from "zod";
import { PRICING_ADDON_IDS, PRICING_CATALOG_VERSION, PRICING_CONFIGURATION_VERSION, PRICING_CUSTOM_MODULE_IDS, PRICING_CUSTOM_SOFTWARE_IDS, PRICING_PRESET_IDS, PRICING_PRODUCTS, pricingCatalogResponseSchema, pricingMetadataSchema, pricingRequestSchema } from "@nbs/shared";
import { addons, allModules, customModuleTiers, customSoftwareTiers, presets } from "./catalog";
import { calculateSelection } from "./calculation-core";
import type { ModuleId } from "./types";

const money = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const quoteSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("exact"), amount: money }),
  z.strictObject({ kind: z.literal("starting_from"), amount: money }),
  z.strictObject({ kind: z.literal("per_session"), amount: money }),
  z.strictObject({ kind: z.literal("custom_quotation") }),
]);
// Priced response contracts live only in the API. Shared contracts contain no amounts.
export const pricingEstimateResponseSchema = z.strictObject({ data: pricingMetadataSchema.extend({
  presetApplied: z.enum(PRICING_PRESET_IDS).nullable(), estimatedTotal: money, componentOnlyTotal: money, bundleSavings: money,
  hasStartingFromItems: z.boolean(), hasCustomQuotationItems: z.boolean(),
  lineItems: z.array(z.strictObject({ id: z.string().max(80), kind: z.enum(["module", "addon", "custom-module", "custom-software", "preset"]), quote: quoteSchema, amount: money, isEstimateFloor: z.boolean() })).max(40),
}).superRefine((value, ctx) => {
  if (value.lineItems.reduce((sum, line) => sum + line.amount, 0) !== value.estimatedTotal || value.componentOnlyTotal - value.estimatedTotal !== value.bundleSavings) {
    ctx.addIssue({ code: "custom", message: "Inconsistent estimate totals." });
  }
}) });
export type PricingEstimateResponse = z.infer<typeof pricingEstimateResponseSchema>;
const metadata = { configurationVersion: PRICING_CONFIGURATION_VERSION, catalogVersion: PRICING_CATALOG_VERSION, currency: "JOD" as const };

export { chooseCheapestCandidate } from "./calculation-core";
export function calculatePricing(raw: unknown): PricingEstimateResponse {
  const state = pricingRequestSchema.parse(raw);
  const calculated = calculateSelection(state, {
    modules: Object.fromEntries(allModules.map(item => [item.id, item.quote])), presets: Object.fromEntries(presets.map(item => [item.id, item.presetPrice])),
    addons: Object.fromEntries(addons.map(item => [item.id, item.quote])), customModules: Object.fromEntries(Object.entries(customModuleTiers).map(([id,item]) => [id,item.quote])),
    customSoftware: Object.fromEntries(Object.entries(customSoftwareTiers).map(([id,item]) => [id,item.quote])),
  });
  return pricingEstimateResponseSchema.parse({ data: { ...metadata, ...calculated } });
}

export function getPricingCatalog() {
  return pricingCatalogResponseSchema.parse({ data: { ...metadata, products: [...PRICING_PRODUCTS],
    modules: allModules.map(item => ({ id: item.id as ModuleId, product: item.product, required: item.required ?? false,
      requires: item.requires ?? [], recommends: item.recommends ?? [], requiresAnyOf: item.id === "erp-operations" ? ["erp-procurement", "erp-sales"] : [], featureKeys: item.featureKeys, honesty: item.honesty ?? null })),
    presets: presets.map(preset => ({ id: preset.id, product: preset.product, moduleIds: preset.moduleIds })),
    addons: PRICING_ADDON_IDS.map(id => ({ id, externalCostNote: addons.find(addon => addon.id === id)?.externalCostNote ?? false })),
    customModuleTiers: [...PRICING_CUSTOM_MODULE_IDS], customSoftwareTiers: [...PRICING_CUSTOM_SOFTWARE_IDS] } });
}
