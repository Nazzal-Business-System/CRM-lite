import { PERMISSION_KEYS, PRICE_BOOK_IDS, type AuthUser, type PriceBookId } from "@nbs/shared";
import type { Prisma } from "../generated/prisma/client";
import { env } from "../env";
import { AppError, forbidden } from "./errors";
export type PriceBookDb = Pick<Prisma.TransactionClient, "priceBookGrant" | "userPricingPreference">;
export function ensureNativePricing() { if (env.PRICING_MODE !== "price_books")
    throw new AppError(503, "PRICE_BOOK_ROLLOUT_PENDING", "Native price-book activation requires the reviewed schema and explicit user grants."); }
export function requireLegacyPricing() { if (env.PRICING_MODE === "price_books")
    throw new AppError(409, "PRICE_BOOK_REQUIRED", "Select an explicitly authorized native price book. Legacy FX pricing is closed."); }
export function canManagePriceBooks(actor: AuthUser) { return actor.role.isSystem && actor.role.name === "Admin" && actor.permissions.includes(PERMISSION_KEYS.PRICING_PRICEBOOKS_MANAGE); }
export async function priceBookStorage<T>(work: () => Promise<T>) { try {
    return await work();
}
catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    if (["P1001", "P1002", "P1008", "P1017", "P2021", "P2022", "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT"].includes(code))
        throw new AppError(503, "PRICE_BOOK_STORAGE_UNAVAILABLE", "Price-book access storage is not ready or temporarily unavailable.");
    throw error;
} }
export async function loadPriceBookAccess(db: PriceBookDb, actor: AuthUser) {
    if (!actor.permissions.includes(PERMISSION_KEYS.PRICING_VIEW))
        throw forbidden();
    return priceBookStorage(async () => {
        const [grants, preference] = await Promise.all([db.priceBookGrant.findMany({ where: { userId: actor.id }, select: { bookId: true }, orderBy: { bookId: "asc" } }), db.userPricingPreference.findUnique({ where: { userId: actor.id }, select: { defaultBookId: true } })]);
        const bookIds = grants.map(grant => grant.bookId);
        const defaultBookId = preference?.defaultBookId ?? null;
        if (bookIds.some(id => !PRICE_BOOK_IDS.includes(id)) || defaultBookId && !bookIds.includes(defaultBookId))
            throw new AppError(503, "PRICE_BOOK_ACCESS_INVALID", "The authorized price-book default needs administrative correction.");
        return { bookIds, defaultBookId };
    });
}
export async function assertPriceBookAccess(db: PriceBookDb, actor: AuthUser, id: PriceBookId) { const access = await loadPriceBookAccess(db, actor); if (!access.bookIds.includes(id))
    throw forbidden("This price book is not authorized."); return access; }
