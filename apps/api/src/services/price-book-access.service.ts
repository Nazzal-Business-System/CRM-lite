import { replacePriceBookAccessSchema, effectivePriceBookIds, type AuthUser } from "@nbs/shared";
import { prisma } from "../lib/prisma";
import { canManagePriceBooks, priceBookStorage } from "../lib/price-book-access";
import { forbidden, notFound } from "../lib/errors";
import { writeAuditLog } from "./audit.service";
function manager(actor: AuthUser) { if (!canManagePriceBooks(actor))
    throw forbidden("System Admin and explicit price-book management permission are required."); }
export async function getUserPriceBookAccess(userId: string, actor: AuthUser) { manager(actor); return priceBookStorage(async () => { if (!await prisma.user.findUnique({ where: { id: userId }, select: { id: true } }))
    throw notFound("Account not found."); const [grants, preference] = await Promise.all([prisma.priceBookGrant.findMany({ where: { userId }, select: { bookId: true, assignedAt: true, assignedByUserId: true }, orderBy: { bookId: "asc" } }), prisma.userPricingPreference.findUnique({ where: { userId }, select: { defaultBookId: true } })]); return { userId, grants, defaultBookId: preference?.defaultBookId ?? null }; }); }
export async function replaceUserPriceBookAccess(userId: string, raw: unknown, actor: AuthUser) {
    manager(actor);
    const input = replacePriceBookAccessSchema.parse(raw);
    const bookIds = effectivePriceBookIds(input);
    return priceBookStorage(() => prisma.$transaction(async (tx) => {
        const locked = await tx.$queryRaw<Array<{
            id: string;
        }>> `SELECT id FROM users WHERE id=${userId} FOR UPDATE`;
        if (!locked.length)
            throw notFound("Account not found.");
        const before = await tx.priceBookGrant.findMany({ where: { userId }, select: { bookId: true } });
        const preference = await tx.userPricingPreference.findUnique({ where: { userId } });
        if (bookIds.length)
            await tx.priceBookGrant.createMany({ data: bookIds.map(bookId => ({ userId, bookId, assignedByUserId: actor.id })), skipDuplicates: true });
        if (preference)
            await tx.userPricingPreference.update({ where: { userId }, data: { defaultBookId: input.defaultBookId } });
        else
            await tx.userPricingPreference.create({ data: { userId, defaultBookId: input.defaultBookId } });
        await tx.priceBookGrant.deleteMany({ where: { userId, bookId: { notIn: bookIds } } });
        await writeAuditLog({ actorUserId: actor.id, action: "USER_PRICE_BOOKS_CHANGED", entityType: "USER", entityId: userId, metadata: { before: before.map(row => row.bookId), after: bookIds, previousDefault: preference?.defaultBookId ?? null, defaultBookId: input.defaultBookId, scope: input.scope } }, tx);
        return { userId, bookIds, defaultBookId: input.defaultBookId };
    }));
}
