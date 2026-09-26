import type {
  CreateUserInput,
  UpdateUserActivationInput,
  UpdateUserInput,
} from "@nbs/shared";
import { hasAdminCapability } from "@nbs/shared";
import { Prisma } from "../generated/prisma/client";
import { prisma } from "../lib/prisma";
import { hashPassword } from "../lib/password";
import { serializeAuthUser, userAccessInclude } from "../lib/serialize";
import { badRequest, conflict, notFound } from "../lib/errors";
import { countActiveAdminCapableUsers } from "./rbac.service";
import { conciseChanges, writeAuditLog } from "./audit.service";
import { createNotification } from "./notifications.service";

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
    where: { isActive: true },
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

export async function createUser(input: CreateUserInput, actorUserId: string) {
  await getRolePermissionKeys(input.roleId);

  try {
    const user = await prisma.user.create({
      data: {
        name: input.name.trim(),
        email: normalizeEmail(input.email),
        passwordHash: await hashPassword(input.password),
        roleId: input.roleId,
        isActive: input.isActive ?? true,
      },
      include: userAccessInclude,
    });

    const result = serializeAuthUser(user);
    await writeAuditLog({ actorUserId, action: "USER_CREATED", entityType: "USER", entityId: user.id, entityLabel: user.name, metadata: { role: result.role.name, isActive: result.isActive } });
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

export async function updateUser(
  userId: string,
  input: UpdateUserInput & Partial<UpdateUserActivationInput>,
  actorUserId: string,
) {
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
    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.email !== undefined
          ? { email: normalizeEmail(input.email) }
          : {}),
        ...(input.roleId !== undefined ? { roleId: input.roleId } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.password
          ? { passwordHash: await hashPassword(input.password) }
          : {}),
      },
      include: userAccessInclude,
    });

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
