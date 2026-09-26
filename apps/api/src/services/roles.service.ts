import {
  hasAdminCapability,
  isPermissionKey,
  PERMISSION_DEFINITIONS,
  SYSTEM_ROLE_NAMES,
  type CreateRoleInput,
  type RoleSummary,
  type UpdateRoleInput,
} from "@nbs/shared";
import { Prisma } from "../generated/prisma/client";
import { prisma } from "../lib/prisma";
import { badRequest, conflict, notFound } from "../lib/errors";
import {
  countActiveAdminCapableUsers,
  isProtectedAdminRole,
  loadPermissionIds,
} from "./rbac.service";
import { conciseChanges, writeAuditLog } from "./audit.service";

function toRoleSummary(role: {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  createdAt: Date;
  updatedAt: Date;
  users: Array<{ id: string }>;
  permissions: Array<{ permission: { key: string } }>;
}): RoleSummary {
  return {
    id: role.id,
    name: role.name,
    description: role.description,
    isSystem: role.isSystem,
    userCount: role.users.length,
    permissionKeys: role.permissions.map((entry) => entry.permission.key),
    createdAt: role.createdAt.toISOString(),
    updatedAt: role.updatedAt.toISOString(),
  };
}

const roleInclude = {
  users: { select: { id: true } },
  permissions: { include: { permission: true } },
} as const;

async function assertKnownPermissionKeys(keys: readonly string[]): Promise<string[]> {
  const unknown = keys.filter((key) => !isPermissionKey(key));
  if (unknown.length > 0) {
    throw badRequest("One or more permission keys are not recognized.", {
      permissionKeys: unknown,
    });
  }

  const loaded = await loadPermissionIds(keys);
  if (loaded.missing.length > 0) {
    throw badRequest("One or more permissions are not available in the database.", {
      permissionKeys: loaded.missing,
    });
  }

  return loaded.ids;
}

export async function listRoles(): Promise<RoleSummary[]> {
  const roles = await prisma.role.findMany({
    include: roleInclude,
    orderBy: [{ isSystem: "desc" }, { name: "asc" }],
  });

  return roles.map(toRoleSummary);
}

export async function listPermissionCatalog() {
  return PERMISSION_DEFINITIONS;
}

export async function listRoleOptions() {
  return prisma.role.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

export async function createRole(input: CreateRoleInput, actorUserId: string): Promise<RoleSummary> {
  const permissionIds = await assertKnownPermissionKeys(input.permissionKeys);

  try {
    const role = await prisma.role.create({
      data: {
        name: input.name.trim(),
        description: input.description?.trim() || null,
        isSystem: false,
        permissions: {
          create: permissionIds.map((permissionId) => ({ permissionId })),
        },
      },
      include: roleInclude,
    });

    const result = toRoleSummary(role);
    await writeAuditLog({ actorUserId, action: "ROLE_CREATED", entityType: "ROLE", entityId: role.id, entityLabel: role.name, metadata: { permissionKeys: result.permissionKeys } });
    return result;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw conflict("A role with this name already exists.");
    }
    throw error;
  }
}

export async function updateRole(
  roleId: string,
  input: UpdateRoleInput,
  actorUserId: string,
): Promise<RoleSummary> {
  const existing = await prisma.role.findUnique({
    where: { id: roleId },
    include: roleInclude,
  });

  if (!existing) {
    throw notFound("Role not found.");
  }

  if (isProtectedAdminRole(existing) && input.permissionKeys) {
    throw conflict("The Admin system role always retains full access.");
  }

  if (existing.isSystem && input.name && input.name.trim() !== existing.name) {
    throw conflict("System role names cannot be changed.");
  }

  let nextKeys = existing.permissions.map((entry) => entry.permission.key);
  let permissionIds: string[] | undefined;

  if (input.permissionKeys) {
    permissionIds = await assertKnownPermissionKeys(input.permissionKeys);
    nextKeys = input.permissionKeys.filter(isPermissionKey);
  }

  const currentlyAdminCapable = hasAdminCapability(
    existing.permissions.map((entry) => entry.permission.key),
  );
  const nextAdminCapable = hasAdminCapability(nextKeys);

  if (currentlyAdminCapable && !nextAdminCapable) {
    const assignedActiveAdmins = await prisma.user.count({
      where: { roleId: existing.id, isActive: true },
    });
    const remaining = await countActiveAdminCapableUsers();
    if (assignedActiveAdmins > 0 && remaining - assignedActiveAdmins <= 0) {
      throw conflict(
        "This change would remove the last administrator capability from the system.",
      );
    }
  }

  try {
    const role = await prisma.$transaction(async (tx) => {
      if (permissionIds) {
        await tx.rolePermission.deleteMany({ where: { roleId: existing.id } });
        if (permissionIds.length > 0) {
          await tx.rolePermission.createMany({
            data: permissionIds.map((permissionId) => ({
              roleId: existing.id,
              permissionId,
            })),
          });
        }
      }

      return tx.role.update({
        where: { id: existing.id },
        data: {
          ...(input.name !== undefined ? { name: input.name.trim() } : {}),
          ...(input.description !== undefined
            ? { description: input.description.trim() || null }
            : {}),
        },
        include: roleInclude,
      });
    });

    const result = toRoleSummary(role);
    await writeAuditLog({ actorUserId, action: input.permissionKeys ? "ROLE_PERMISSIONS_CHANGED" : "ROLE_UPDATED", entityType: "ROLE", entityId: roleId, entityLabel: result.name, changes: conciseChanges({ name: existing.name, description: existing.description }, { name: result.name, description: result.description }, ["name", "description"]), metadata: input.permissionKeys ? { beforePermissionKeys: existing.permissions.map((entry) => entry.permission.key), afterPermissionKeys: result.permissionKeys } : null });
    return result;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw conflict("A role with this name already exists.");
    }
    throw error;
  }
}

export async function deleteRole(roleId: string, actorUserId: string): Promise<void> {
  const existing = await prisma.role.findUnique({
    where: { id: roleId },
    include: { users: { select: { id: true } } },
  });

  if (!existing) {
    throw notFound("Role not found.");
  }

  if (existing.isSystem) {
    throw conflict("System roles cannot be deleted.");
  }

  if (existing.users.length > 0) {
    throw conflict(
      "Reassign users to another role before deleting this role.",
    );
  }

  if (existing.name === SYSTEM_ROLE_NAMES.ADMIN) {
    throw conflict("The Admin role cannot be deleted.");
  }

  await prisma.role.delete({ where: { id: roleId } });
  await writeAuditLog({ actorUserId, action: "ROLE_DELETED", entityType: "ROLE", entityId: roleId, entityLabel: existing.name });
}
