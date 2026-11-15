import { z } from "zod";

// Identifiers/validation metadata only. No catalog amounts or priced calculation code.
export const PRICING_CATALOG_VERSION = "nbs-jod-2026-11-08.1" as const;
export const PRICING_CONFIGURATION_VERSION = 1 as const;
export const PRICING_PRODUCTS = ["erp", "pos", "ims", "custom"] as const;
export const PRICING_MODULE_IDS = ["erp-core", "erp-inventory", "erp-procurement", "erp-sales", "erp-operations", "erp-finance", "erp-accounting", "erp-hr", "erp-ess", "erp-crm", "erp-projects", "erp-support", "erp-knowledge", "erp-reporting", "pos-core", "pos-management", "ims-core", "ims-purchasing", "ims-reorder", "ims-import-export"] as const;
export const PRICING_ADDON_IDS = ["custom-report", "custom-dashboard", "report-export-pack", "data-migration", "custom-document", "email-notifications", "whatsapp-integration", "third-party-api", "payment-gateway", "custom-approval", "staff-training"] as const;
export const PRICING_PRESET_IDS = ["erp-operations", "erp-business", "erp-complete", "pos-core", "pos-management", "ims-core", "ims-purchasing", "ims-operations"] as const;
export const PRICING_CUSTOM_MODULE_IDS = ["focused-module", "business-module", "advanced-module"] as const;
export const PRICING_CUSTOM_SOFTWARE_IDS = ["focused-workflow", "connected-system", "larger-platform"] as const;
export const PRICING_MODULE_DEPENDENCIES: Partial<Record<typeof PRICING_MODULE_IDS[number], readonly typeof PRICING_MODULE_IDS[number][]>> = {
  "erp-procurement": ["erp-inventory"], "erp-sales": ["erp-inventory"], "erp-operations": ["erp-inventory"],
  "erp-ess": ["erp-hr"], "pos-management": ["pos-core"], "ims-purchasing": ["ims-core"], "ims-reorder": ["ims-core"], "ims-import-export": ["ims-core"],
};
const unique = <T extends z.ZodType<string>>(item: T, max: number) => z.array(item).max(max).refine(values => new Set(values).size === values.length, "Selections must be unique.");
const pricingSelectionFields = { configurationVersion: z.literal(PRICING_CONFIGURATION_VERSION),
  product: z.enum(PRICING_PRODUCTS), modules: unique(z.enum(PRICING_MODULE_IDS), PRICING_MODULE_IDS.length),
  addons: unique(z.enum(PRICING_ADDON_IDS), PRICING_ADDON_IDS.length),
  customModuleTier: unique(z.enum(PRICING_CUSTOM_MODULE_IDS), PRICING_CUSTOM_MODULE_IDS.length),
  customSoftwareTier: z.enum(PRICING_CUSTOM_SOFTWARE_IDS).nullable(), customNotes: z.string().max(2000).trim(),

};
const pricingSelectionObjectSchema = z.strictObject(pricingSelectionFields);
function validateSelections(value: z.infer<typeof pricingSelectionObjectSchema>, ctx: z.RefinementCtx) {
  const issue = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
  if (value.product === "custom") {
    if (value.modules.length) issue("modules", "Custom software cannot contain product modules.");
    if (!value.customSoftwareTier) issue("customSoftwareTier", "Choose a custom software tier.");
  } else {
    if (value.customSoftwareTier !== null) issue("customSoftwareTier", "Software tiers apply only to custom software.");
    if (!value.modules.includes(`${value.product}-core`)) issue("modules", "The selected product core is required.");
    for (const id of value.modules) {
      if (!id.startsWith(`${value.product}-`)) issue("modules", "Every module must belong to the selected product.");
      for (const required of PRICING_MODULE_DEPENDENCIES[id] ?? []) if (!value.modules.includes(required)) issue("modules", `${id} requires ${required}.`);
    }
    if (value.modules.includes("erp-operations") && !value.modules.includes("erp-procurement") && !value.modules.includes("erp-sales")) issue("modules", "Operations requires Procurement or Sales in addition to Inventory.");
  }
}
const { configurationVersion, ...selectionFields } = pricingSelectionFields;
const pricingRequestObjectSchema = z.strictObject({ configurationVersion, catalogVersion: z.literal(PRICING_CATALOG_VERSION), ...selectionFields }).superRefine(validateSelections);
export const pricingSelectionSchema = z.preprocess((raw, ctx) => {
  if (raw && typeof raw === "object" && ["__proto__", "constructor", "prototype"].some(key => Object.hasOwn(raw,key))) ctx.addIssue({code:"custom",message:"Unsupported selection property."});
  return raw;
}, pricingSelectionObjectSchema.superRefine(validateSelections));
export type PricingSelection = z.infer<typeof pricingSelectionSchema>;

export const pricingRequestSchema = z.preprocess((raw, ctx) => {
  // Zod intentionally ignores __proto__ during object parsing. This API rejects it explicitly.
  if (raw && typeof raw === "object" && ["__proto__", "constructor", "prototype"].some(key => Object.hasOwn(raw, key))) {
    ctx.addIssue({ code: "custom", message: "Unsupported configuration property." });
  }
  return raw;
}, pricingRequestObjectSchema);
export type PricingRequest = z.infer<typeof pricingRequestSchema>;
export const pricingMetadataSchema = z.strictObject({ configurationVersion: z.literal(PRICING_CONFIGURATION_VERSION), catalogVersion: z.literal(PRICING_CATALOG_VERSION), currency: z.literal("JOD") });
const moduleId = z.enum(PRICING_MODULE_IDS);
export const pricingCatalogResponseSchema = z.strictObject({ data: pricingMetadataSchema.extend({
  products: z.array(z.enum(PRICING_PRODUCTS)).max(4),
  modules: z.array(z.strictObject({ id: moduleId, product: z.enum(PRICING_PRODUCTS), required: z.boolean(), requires: z.array(moduleId), recommends: z.array(moduleId),
    requiresAnyOf: z.array(moduleId), featureKeys: z.array(z.string().max(80)).max(30), honesty: z.enum(["complete", "limitations", "partial", "custom_only", "not_sold"]).nullable() })).max(20),
  presets: z.array(z.strictObject({ id: z.enum(PRICING_PRESET_IDS), product: z.enum(PRICING_PRODUCTS), moduleIds: z.array(moduleId) })).max(8),
  addons: z.array(z.strictObject({ id: z.enum(PRICING_ADDON_IDS), externalCostNote: z.boolean() })).max(11),
  customModuleTiers: z.array(z.enum(PRICING_CUSTOM_MODULE_IDS)).max(3), customSoftwareTiers: z.array(z.enum(PRICING_CUSTOM_SOFTWARE_IDS)).max(3),
}) });
export type PricingCatalogResponse = z.infer<typeof pricingCatalogResponseSchema>;
