import { z } from "zod";
import { pricingRequestSchema } from "./pricing";
export const pricingCurrencySchema = z.enum(["JOD", "USD", "GBP"]);
export type PricingCurrency = z.infer<typeof pricingCurrencySchema>;
export const pricingCurrencyQuerySchema = z.strictObject({ currency: pricingCurrencySchema.default("JOD") });
export const convertedPricingRequestSchema = z.strictObject({ configuration: pricingRequestSchema, currency: pricingCurrencySchema });
export const pricingExchangeSchema = z.object({ version: z.literal("fx-line-half-up-v1"), base: z.literal("JOD"), currency: pricingCurrencySchema,
  rate: z.number().finite().positive().max(1000000), source: z.enum(["JOD catalog", "Frankfurter v2"]), sourceUrl: z.enum(["https://frankfurter.dev/", ""]),
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(), retrievedAt: z.string().datetime().nullable(), expiresAt: z.string().datetime().nullable(),
});
export type PricingExchange = z.infer<typeof pricingExchangeSchema>;
