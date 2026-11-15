import { type AuthUser, type PriceBookId, nativePricingRequestSchema } from "@nbs/shared";
import { forbidden } from "../lib/errors";
import { getPricingCatalog } from "../pricing/engine";
import { prisma } from "../lib/prisma";
import { ensureNativePricing, loadPriceBookAccess, assertPriceBookAccess } from "../lib/price-book-access";
import { publishedPriceBook, nativePriceBookPrices, calculateNativePriceBook, priceBookMetadata } from "../pricing/price-books";
export async function listAuthorizedPriceBooks(actor: AuthUser) { ensureNativePricing(); const access = await loadPriceBookAccess(prisma, actor); return { ...access, books: access.bookIds.map(priceBookMetadata) }; }
async function authorizedBook(actor: AuthUser, id?: PriceBookId, version?: string) { ensureNativePricing(); const access = await loadPriceBookAccess(prisma, actor); const selected = id ?? access.defaultBookId; if (!selected || !access.bookIds.includes(selected))
    throw forbidden("Select an explicitly authorized price book/default."); return publishedPriceBook(selected, version); }
export async function calculateAuthorizedPriceBook(actor: AuthUser, raw: unknown) { ensureNativePricing(); const input = nativePricingRequestSchema.parse(raw); await assertPriceBookAccess(prisma, actor, input.priceBook.id); return calculateNativePriceBook(input.configuration, publishedPriceBook(input.priceBook.id, input.priceBook.version)); }

export async function getAuthorizedPriceBookPrices(actor:AuthUser,id?:PriceBookId,version?:string){const book=await authorizedBook(actor,id,version);return{...nativePriceBookPrices(book),catalog:getPricingCatalog().data};}
export async function getAuthorizedPriceBookCatalog(actor:AuthUser,id?:PriceBookId){const book=await authorizedBook(actor,id);return{...getPricingCatalog().data,currency:book.currency,catalogVersion:book.version,structureVersion:book.structureVersion,priceBook:priceBookMetadata(book.id)};}
