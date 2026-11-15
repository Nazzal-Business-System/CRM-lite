import { PERMISSION_KEYS, type AuthUser } from "@nbs/shared";
import type { Prisma } from "../generated/prisma/client";
import { forbidden, badRequest, notFound } from "../lib/errors";
import { isGlobalMarketAdmin, marketStorage } from "../lib/market-access";
import { prisma } from "../lib/prisma";
import { writeAuditLog } from "./audit.service";
import { validatePartnerMarkets } from "./partner-markets.service";

export function assertMarketMembershipAdmin(actor: AuthUser) {
  if (!isGlobalMarketAdmin(actor) || !actor.permissions.includes(PERMISSION_KEYS.MARKETS_MANAGE_MEMBERSHIPS)) throw forbidden("System Admin and market membership permission are required.");
}
export async function listUserMarkets(userId: string, actor: AuthUser) {
  assertMarketMembershipAdmin(actor);
  return marketStorage(async () => {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) throw notFound("User not found.");
  return prisma.userSalesMarket.findMany({ where: { userId }, select: { marketCode: true, assignedAt: true, assignedByUserId: true, market: { select: { code: true, name: true, nameAr: true } } }, orderBy: { marketCode: "asc" } });
  });
}
export async function replaceUserMarkets(userId: string, marketCodes: string[], actor: AuthUser, defaultMarketCode?: string | null) {
  assertMarketMembershipAdmin(actor);
  return marketStorage(() => prisma.$transaction(async (tx) => {
    // Serialize concurrent replacements for the same user without changing the user or its sessions.
    const locked = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
    if (!locked.length) throw notFound("User not found.");
    const user = await tx.user.findUnique({ where: { id: userId }, include: { role: true } });
    if (!user) throw notFound("User not found.");
    const unique = [...new Set(marketCodes)];
    const markets = await tx.salesMarket.findMany({ where: { code: { in: unique } }, select: { code: true } });
    if (markets.length !== unique.length) throw badRequest("Every membership must reference a configured sales market.");
    const before = await tx.userSalesMarket.findMany({ where: { userId }, select: { marketCode: true } });
    const nextDefault = defaultMarketCode !== undefined ? defaultMarketCode : user.defaultMarketCode ?? null;
    await validatePartnerMarkets(tx, { accountType: user.accountType ?? "INTERNAL", marketCodes: unique, defaultMarketCode: nextDefault, global: isGlobalMarketAdmin(user) });
    await tx.userSalesMarket.deleteMany({ where: { userId, marketCode: { notIn: unique } } });
    await tx.userSalesMarket.createMany({ data: unique.map((marketCode) => ({ userId, marketCode, assignedByUserId: actor.id })), skipDuplicates: true });
    if (defaultMarketCode !== undefined) await tx.user.update({ where: { id: userId }, data: { defaultMarketCode: nextDefault } });
    await writeAuditLog({ actorUserId: actor.id, action: "USER_MARKETS_CHANGED", entityType: "USER", entityId: userId, metadata: { before: before.map((entry) => entry.marketCode), after: unique } }, tx);
    return { userId, marketCodes: unique, defaultMarketCode: nextDefault };
  }));
}

export async function inspectMarketPermission(tx: Prisma.TransactionClient) {
  const role = await tx.role.findUnique({ where: { name: "Admin" }, select: { id: true, isSystem: true } });
  const permission = await tx.permission.findUnique({ where: { key: PERMISSION_KEYS.MARKETS_MANAGE_MEMBERSHIPS }, select: { id: true } });
  const grant = role && permission ? await tx.rolePermission.findUnique({ where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } } }) : null;
  return { adminRoleReady: Boolean(role?.isSystem), missingPermission: !permission, missingAdminGrant: !grant };
}
export async function provisionMarketPermission(tx: Prisma.TransactionClient) {
  const role = await tx.role.findUnique({ where: { name: "Admin" } });
  if (!role?.isSystem) throw badRequest("An existing system Admin role is required.");
  const permission = await tx.permission.upsert({ where: { key: PERMISSION_KEYS.MARKETS_MANAGE_MEMBERSHIPS }, create: { key: PERMISSION_KEYS.MARKETS_MANAGE_MEMBERSHIPS, description: "Manage user sales market memberships (system Admin only)", category: "Governance" }, update: {} });
  await tx.rolePermission.upsert({ where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } }, create: { roleId: role.id, permissionId: permission.id }, update: {} });
  return inspectMarketPermission(tx);
}
