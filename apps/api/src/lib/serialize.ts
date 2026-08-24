import type { AuthUser } from "@nbs/shared";
import type { Permission, Role, RolePermission, User } from "../generated/prisma/client";

type UserWithAccess = User & {
  role: Role & {
    permissions: Array<RolePermission & { permission: Permission }>;
  };
};

export function toIso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

export function permissionKeysOf(user: UserWithAccess): string[] {
  return user.role.permissions.map((entry) => entry.permission.key);
}

export function serializeAuthUser(user: UserWithAccess): AuthUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    isActive: user.isActive,
    lastLoginAt: toIso(user.lastLoginAt),
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
    role: {
      id: user.role.id,
      name: user.role.name,
      description: user.role.description,
      isSystem: user.role.isSystem,
    },
    permissions: permissionKeysOf(user),
  };
}

export const userAccessInclude = {
  role: {
    include: {
      permissions: {
        include: {
          permission: true,
        },
      },
    },
  },
} as const;
