import {
  ADMIN_CAPABILITY_PERMISSIONS,
  hasAdminCapability,
  SYSTEM_ROLE_NAMES,
} from "@nbs/shared";
import { prisma } from "../lib/prisma";

export async function loadPermissionIds(keys: readonly string[]): Promise<{
  ids: string[];
  missing: string[];
}> {
  const uniqueKeys = [...new Set(keys)];
  const permissions = await prisma.permission.findMany({
    where: { key: { in: uniqueKeys } },
    select: { id: true, key: true },
  });

  const found = new Set(permissions.map((permission) => permission.key));
  return {
    ids: permissions.map((permission) => permission.id),
    missing: uniqueKeys.filter((key) => !found.has(key)),
  };
}

export async function countActiveAdminCapableUsers(
  excludeUserId?: string,
): Promise<number> {
  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
    },
    select: {
      role: {
        select: {
          permissions: {
            select: { permission: { select: { key: true } } },
          },
        },
      },
    },
  });

  return users.filter((user) =>
    hasAdminCapability(
      user.role.permissions.map((entry) => entry.permission.key),
    ),
  ).length;
}

export function isProtectedAdminRole(role: {
  name: string;
  isSystem: boolean;
}): boolean {
  return role.isSystem && role.name === SYSTEM_ROLE_NAMES.ADMIN;
}

export { ADMIN_CAPABILITY_PERMISSIONS };
