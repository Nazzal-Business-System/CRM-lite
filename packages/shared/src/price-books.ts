import { z } from "zod";
import { pricingSelectionSchema } from "./pricing";
export const PRICE_BOOK_IDS = ["JO", "US", "UK"] as const;
export const PRODUCT_STRUCTURE_VERSION = "nbs-products-v1" as const;
export const priceBookIdSchema = z.enum(PRICE_BOOK_IDS);
export type PriceBookId = z.infer<typeof priceBookIdSchema>;
export const PRICE_BOOK_CURRENCIES = { JO: "JOD", US: "USD", UK: "GBP" } as const;
export const priceBookReferenceSchema = z.strictObject({ id: priceBookIdSchema, version: z.string().min(1).max(80), structureVersion: z.literal(PRODUCT_STRUCTURE_VERSION) });
export const nativePricingRequestSchema = z.strictObject({ priceBook: priceBookReferenceSchema, configuration: pricingSelectionSchema });
export const priceBookParamsSchema = z.strictObject({ bookId: priceBookIdSchema });
export const priceBookVersionQuerySchema = z.strictObject({ version: z.string().min(1).max(80).optional() });
export const replacePriceBookAccessSchema = z.discriminatedUnion("scope", [
    z.strictObject({ scope: z.literal("selected"), bookIds: z.array(priceBookIdSchema).max(3).refine(ids => new Set(ids).size === ids.length, "Duplicate price books."), defaultBookId: priceBookIdSchema.nullable() }).superRefine((value, ctx) => { if (value.bookIds.length ? !value.defaultBookId || !value.bookIds.includes(value.defaultBookId) : value.defaultBookId !== null)
        ctx.addIssue({ code: "custom", message: "Choose an authorized default for nonempty access; empty access requires no default." }); }),
    z.strictObject({ scope: z.literal("international"), defaultBookId: priceBookIdSchema }),
]);
export type ReplacePriceBookAccess = z.infer<typeof replacePriceBookAccessSchema>;
export const effectivePriceBookIds = (input: ReplacePriceBookAccess): PriceBookId[] => input.scope === "international" ? [...PRICE_BOOK_IDS] : [...input.bookIds];

export const priceBookCatalogQuerySchema=z.strictObject({bookId:priceBookIdSchema.optional()});
