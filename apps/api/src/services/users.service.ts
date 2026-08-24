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

export async function createUser(input: CreateUserInput) {
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

    return serializeAuthUser(user);
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

    return serializeAuthUser(user);
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
