import { PERMISSION_DEFINITIONS, PERMISSION_KEYS, SYSTEM_ROLE_NAMES } from "@nbs/shared";
import type { Prisma } from "../generated/prisma/client";

const keys = [PERMISSION_KEYS.SESSIONS_VIEW, PERMISSION_KEYS.SESSIONS_REVOKE];
export async function inspectSessionPermissions(db: Prisma.TransactionClient) {
  const role = await db.role.findUnique({ where: { name: SYSTEM_ROLE_NAMES.ADMIN }, select: { id: true, isSystem: true } });
  const records = await db.permission.findMany({ where: { key: { in: keys } }, select: { id: true, key: true } });
  const grants = role?.isSystem ? await db.rolePermission.findMany({
    where: { roleId: role.id, permission: { key: { in: keys } } }, select: { permission: { select: { key: true } } },
  }) : [];
  return {
    adminRoleReady: Boolean(role?.isSystem),
    missingPermissions: keys.filter((key) => !records.some((record) => record.key === key)),
    missingAdminGrants: keys.filter((key) => !grants.some((grant) => grant.permission.key === key)),
  };
}

// Caller supplies one transaction: only these two permissions and their system
// Admin grants are added. No user, role, unrelated grant or custom role is edited.
export async function provisionSessionPermissions(tx: Prisma.TransactionClient) {
  const role = await tx.role.findUnique({ where: { name: SYSTEM_ROLE_NAMES.ADMIN }, select: { id: true, isSystem: true } });
  if (!role?.isSystem) throw new Error("An existing system Admin role is required; no changes were made.");
  for (const key of keys) {
    const definition = PERMISSION_DEFINITIONS.find((item) => item.key === key);
    if (!definition) throw new Error("Missing session permission definition.");
    const permission = await tx.permission.upsert({ where: { key }, update: {}, create: {
      key, description: definition.description, category: definition.category,
    }, select: { id: true } });
    await tx.rolePermission.upsert({ where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
      update: {}, create: { roleId: role.id, permissionId: permission.id } });
  }
  return inspectSessionPermissions(tx);
}
