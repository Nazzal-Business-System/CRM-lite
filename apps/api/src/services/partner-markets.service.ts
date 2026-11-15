import { PERMISSION_KEYS, type AuthUser } from "@nbs/shared";
import type { Prisma } from "../generated/prisma/client";
import { isGlobalMarketAdmin } from "../lib/market-access";
import { badRequest, forbidden } from "../lib/errors";
import { writeAuditLog } from "./audit.service";

export function assertPartnerMarketAdmin(actor?: AuthUser) {
  if (!actor || !isGlobalMarketAdmin(actor) || !actor.permissions.includes(PERMISSION_KEYS.MARKETS_MANAGE_MEMBERSHIPS)) throw forbidden("System Admin and market membership permission are required.");
}
export async function validatePartnerMarkets(tx: Prisma.TransactionClient, value: { accountType: string; marketCodes: string[]; defaultMarketCode: string | null; global: boolean }) {
  if (new Set(value.marketCodes).size !== value.marketCodes.length) throw badRequest("Duplicate sales markets are not allowed.");
  const referenced = [...new Set([...value.marketCodes, ...(value.defaultMarketCode ? [value.defaultMarketCode] : [])])];
  if (referenced.length) {
    const known = await tx.salesMarket.findMany({ where: { code: { in: referenced } }, select: { code: true } });
    if (known.length !== referenced.length) throw badRequest("Every assigned/default market must be configured.");
  }
  if (!value.global && value.defaultMarketCode && !value.marketCodes.includes(value.defaultMarketCode)) throw badRequest("The default market must be an assigned market.", { defaultMarketCode: ["Choose an assigned market."] });
  if (!value.global && value.accountType === "PARTNER" && (!value.marketCodes.length || !value.defaultMarketCode)) throw badRequest("Sales Partners require at least one market and an assigned default.", { marketCodes: ["Assign at least one sales market."], defaultMarketCode: ["Choose an assigned default market."] });
}
export async function storePartnerMarkets(tx: Prisma.TransactionClient, userId: string, marketCodes: string[], defaultMarketCode: string | null, actor: AuthUser) {
  const before = await tx.userSalesMarket.findMany({ where: { userId }, select: { marketCode: true } });
  await tx.userSalesMarket.deleteMany({ where: { userId, marketCode: { notIn: marketCodes } } });
  if (marketCodes.length) await tx.userSalesMarket.createMany({ data: marketCodes.map(marketCode => ({ userId, marketCode, assignedByUserId: actor.id })), skipDuplicates: true });
  await tx.user.update({ where: { id: userId }, data: { defaultMarketCode } });
  await writeAuditLog({ actorUserId: actor.id, action: "USER_MARKETS_CHANGED", entityType: "USER", entityId: userId, metadata: { before: before.map(item => item.marketCode), after: marketCodes, defaultMarketCode } }, tx);
}
