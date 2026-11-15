import { z } from "zod";
import { priceBookReferenceSchema } from "./price-books";
import { pricingCurrencySchema } from "./pricing-currency";
import { pricingSelectionSchema, pricingRequestSchema } from "./pricing";

const id = z.string().trim().min(1).max(128);
const estimateFields = { title: z.string().max(200).trim().min(1), notes: z.string().max(4000).trim(), companyId: id.nullable() };
const createPricingEstimateObjectSchema = z.union([
  z.strictObject({ ...estimateFields, priceBook: priceBookReferenceSchema, displayCurrency: z.never().optional(), configuration: pricingSelectionSchema }),
  z.strictObject({ ...estimateFields, priceBook: z.never().optional(), displayCurrency: pricingCurrencySchema.optional(), configuration: pricingRequestSchema }),
]);
export const createPricingEstimateSchema = z.preprocess((raw, ctx) => {
  if (raw && typeof raw === "object" && ["__proto__", "constructor", "prototype"].some(key => Object.hasOwn(raw, key))) {
    ctx.addIssue({ code: "custom", message: "Unsupported estimate property." });
  }
  if (raw && typeof raw === "object" && "priceBook" in raw && "displayCurrency" in raw) ctx.addIssue({ code: "custom", message: "Native price books cannot use display-currency conversion." });
  return raw;
}, createPricingEstimateObjectSchema);
export const pricingEstimateParamsSchema = z.strictObject({ id });
export const pricingEstimateListQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).max(100000).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().max(200).trim().default(""), companyId: id.optional(), createdById: id.optional(),
  scope: z.enum(["all", "standalone", "linked"]).default("all"),
});
export type CreatePricingEstimateInput = z.infer<typeof createPricingEstimateSchema>;
export type PricingEstimateListQuery = z.infer<typeof pricingEstimateListQuerySchema>;
