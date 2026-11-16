import type {
  CreateUserInput,
  UpdateUserActivationInput,
  UpdateUserInput,
  AuthUser,
} from "@nbs/shared";
import { hasAdminCapability } from "@nbs/shared";
import { Prisma } from "../generated/prisma/client";
import { marketUserOptionsWhere, assertGlobalMarketAdminSurvives, isGlobalMarketAdmin, marketStorage } from "../lib/market-access";
import { prisma } from "../lib/prisma";
import { hashPassword } from "../lib/password";
import { serializeAuthUser, userAccessInclude } from "../lib/serialize";
import { badRequest, conflict, notFound } from "../lib/errors";
import { countActiveAdminCapableUsers } from "./rbac.service";
import { conciseChanges, writeAuditLog } from "./audit.service";
import { lockSessionUser, revokeUserSessions } from "./sessions.service";
import { createNotification } from "./notifications.service";
import { assertPartnerMarketAdmin, storePartnerMarkets, validatePartnerMarkets } from "./partner-markets.service";
import { assertPriceBookManager, storeUserPriceBookAccess } from "./price-book-access.service";
import { priceBookStorage } from "../lib/price-book-access";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function getRolePermissionKeys(roleId: string): Promise<string[]> {
  const role = await prisma.role.findUnique({
    where: { id: roleId },
    include: {
      permissions: { include: { permission: true } },
    },
  });

  if (!role) {
    throw badRequest("Selected role was not found.", {
      roleId: ["Selected role was not found."],
    });
  }

  return role.permissions.map((entry) => entry.permission.key);
}

export async function listActiveUserOptions() {
  return prisma.user.findMany({
    where: { isActive: true, ...await marketUserOptionsWhere(prisma) },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true },
  });
}

export async function listUsers() {
  const users = await prisma.user.findMany({
    include: userAccessInclude,
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  });

  return users.map(serializeAuthUser);
}

export async function createUser(input: CreateUserInput, actorUserId: string, actor?: AuthUser) {
  if (input.priceBookAccess !== undefined) assertPriceBookManager(actor);
  await getRolePermissionKeys(input.roleId);
  const withMarkets = input.marketCodes !== undefined || input.defaultMarketCode !== undefined || input.accountType === "PARTNER";
  if (withMarkets) assertPartnerMarketAdmin(actor);
  const passwordHash = await hashPassword(input.password);

  try {
    return await marketStorage(() => priceBookStorage(() => prisma.$transaction(async tx => {
      const role = await tx.role.findUnique({ where: { id: input.roleId } });
      if (!role) throw badRequest("Selected role was not found.");
      const marketCodes = input.marketCodes ?? [];
      const defaultMarketCode = input.defaultMarketCode ?? null;
      await validatePartnerMarkets(tx, { accountType: input.accountType ?? "INTERNAL", marketCodes, defaultMarketCode, global: isGlobalMarketAdmin({ role }) });
      const user = await tx.user.create({
      data: {
        ...(input.accountType === "PARTNER" ? { accountType: "PARTNER" as const } : {}),
        name: input.name.trim(),
        email: normalizeEmail(input.email),
        passwordHash,
        roleId: input.roleId,
        isActive: input.isActive ?? true,
      },
      include: userAccessInclude,
    });

      if (withMarkets) await storePartnerMarkets(tx, user.id, marketCodes, defaultMarketCode, actor!);
      if (input.priceBookAccess !== undefined) await storeUserPriceBookAccess(tx, user.id, input.priceBookAccess, actor!);
      await writeAuditLog({ actorUserId, action: "USER_CREATED", entityType: "USER", entityId: user.id, entityLabel: user.name, metadata: { role: user.role.name, isActive: user.isActive, accountType: input.accountType ?? "INTERNAL" } }, tx);
      return serializeAuthUser((await tx.user.findUnique({ where: { id: user.id }, include: userAccessInclude }))!);
    })));
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw conflict("A user with this email already exists.");
    }
    throw error;
  }
}

export async function updateUser(
  userId: string,
  input: UpdateUserInput & Partial<UpdateUserActivationInput>,
  actorUserId: string,
  actor?: AuthUser,
) {
  if (input.priceBookAccess !== undefined) assertPriceBookManager(actor);
  const withMarkets = input.marketCodes !== undefined || input.defaultMarketCode !== undefined || input.accountType !== undefined;
  if (withMarkets) assertPartnerMarketAdmin(actor);
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    include: userAccessInclude,
  });

  if (!existing) {
    throw notFound("User not found.");
  }

  const currentKeys = existing.role.permissions.map(
    (entry) => entry.permission.key,
  );
  const currentlyAdminCapable = hasAdminCapability(currentKeys);

  let nextKeys = currentKeys;
  if (input.roleId && input.roleId !== existing.roleId) {
    nextKeys = await getRolePermissionKeys(input.roleId);
  }

  const wouldRemainActive = input.isActive ?? existing.isActive;
  const wouldRemainAdminCapable =
    wouldRemainActive && hasAdminCapability(nextKeys);

  if (currentlyAdminCapable && existing.isActive && !wouldRemainAdminCapable) {
    const remaining = await countActiveAdminCapableUsers(existing.id);
    if (remaining === 0) {
      throw conflict(
        "The last active administrator cannot be deactivated or moved to a non-admin role.",
      );
    }
  }

  try {
    const nextPasswordHash = input.password ? await hashPassword(input.password) : undefined;
    const invalidateSessions = Boolean(nextPasswordHash) || input.isActive === false;
    const user = await priceBookStorage(() => prisma.$transaction(async (tx) => {
      await lockSessionUser(tx, userId);
      await assertGlobalMarketAdminSurvives(tx, existing, input);
      const locked = await tx.user.findUnique({ where: { id: userId }, include: userAccessInclude });
      if (!locked) throw notFound("User not found.");
      const role = input.roleId ? await tx.role.findUnique({ where: { id: input.roleId } }) : locked.role;
      if (!role) throw badRequest("Selected role was not found.");
      const marketCodes = input.marketCodes ?? locked.marketMemberships.map(item => item.marketCode);
      const defaultMarketCode = input.defaultMarketCode !== undefined ? input.defaultMarketCode : locked.defaultMarketCode;
      await validatePartnerMarkets(tx, { accountType: input.accountType ?? locked.accountType, marketCodes, defaultMarketCode, global: isGlobalMarketAdmin({ role }) });
      const updated = await tx.user.update({
        where: { id: userId },
        data: {
          ...(input.accountType !== undefined ? { accountType: input.accountType } : {}),
          ...(invalidateSessions ? { sessionVersion: { increment: 1 }, legacyInvalidBefore: new Date() } : {}),
          ...(input.name !== undefined ? { name: input.name.trim() } : {}),
          ...(input.email !== undefined
            ? { email: normalizeEmail(input.email) }
            : {}),
          ...(input.roleId !== undefined ? { roleId: input.roleId } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
          ...(nextPasswordHash
            ? { passwordHash: nextPasswordHash }
            : {}),
        },
        include: userAccessInclude,
      });
      if (invalidateSessions) await revokeUserSessions(tx, userId, nextPasswordHash ? "PASSWORD_CHANGED" : "ACCOUNT_DEACTIVATED");
      if (withMarkets) await storePartnerMarkets(tx, userId, marketCodes, defaultMarketCode, actor!);
      if (input.priceBookAccess !== undefined) await storeUserPriceBookAccess(tx, userId, input.priceBookAccess, actor!);
      return withMarkets ? (await tx.user.findUnique({ where: { id: userId }, include: userAccessInclude }))! : updated;
    }));

    const result = serializeAuthUser(user);
    const changes = conciseChanges(
      { name: existing.name, email: existing.email, role: existing.role.name, isActive: existing.isActive },
      { name: result.name, email: result.email, role: result.role.name, isActive: result.isActive },
      ["name", "email", "role", "isActive"],
    );
    const action = existing.isActive !== result.isActive ? (result.isActive ? "USER_ACTIVATED" : "USER_DEACTIVATED") : existing.roleId !== result.role.id ? "USER_ROLE_CHANGED" : "USER_UPDATED";
    await writeAuditLog({ actorUserId, action, entityType: "USER", entityId: userId, entityLabel: result.name, changes, metadata: input.password ? { passwordChanged: true } : null });
    if (actorUserId !== userId && (existing.roleId !== result.role.id || existing.isActive !== result.isActive)) {
      await createNotification({ recipientUserId: userId, type: action, title: "Your CRM access changed", message: existing.roleId !== result.role.id ? `Your role is now ${result.role.name}.` : result.isActive ? "Your CRM account was activated." : "Your CRM account was deactivated.", titleAr: "تغيّرت صلاحيات حسابك", messageAr: existing.roleId !== result.role.id ? `أصبح دورك الآن ${result.role.name}.` : result.isActive ? "تم تفعيل حسابك في النظام." : "تم إيقاف حسابك في النظام.", entityType: "USER", entityId: userId, link: null });
    }
    return result;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw conflict("A user with this email already exists.");
    }
    throw error;
  }
}
