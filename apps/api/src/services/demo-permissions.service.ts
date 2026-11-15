import { PERMISSION_DEFINITIONS, PERMISSION_KEYS } from "@nbs/shared";
import type { Prisma } from "../generated/prisma/client";
import { badRequest } from "../lib/errors";
const key = PERMISSION_KEYS.DEMOS_VIEW;
async function targets(tx: Prisma.TransactionClient, partnerIds: readonly string[], adminOnly: boolean) {
  if ((adminOnly ? partnerIds.length !== 0 : !partnerIds.length) || partnerIds.length > 20 || new Set(partnerIds).size !== partnerIds.length) throw badRequest("Choose Admin-only or explicitly approved, unique Sales Partner role IDs.");
  const admin = await tx.role.findUnique({ where: { name: "Admin" }, select: { id: true, isSystem: true } });
  if (!admin?.isSystem || partnerIds.includes(admin.id)) throw badRequest("An existing system Admin role and distinct partner roles are required.");
  const partners = adminOnly ? [] : await tx.role.findMany({ where: { id: { in: [...partnerIds] } }, select: { id: true } });
  if (partners.length !== partnerIds.length) throw badRequest("Every explicitly approved Sales Partner role must exist.");
  return [admin.id, ...partners.map(role => role.id)];
}
export async function inspectDemoPermissions(tx: Prisma.TransactionClient, partnerIds: readonly string[], adminOnly = false) {
  const roles = await targets(tx, partnerIds, adminOnly);
  const permission = await tx.permission.findUnique({ where: { key }, select: { id: true } });
  const grants = permission ? await tx.rolePermission.findMany({ where: { roleId: { in: roles }, permissionId: permission.id }, select: { roleId: true } }) : [];
  return { missingPermissions: permission ? [] : [key], missingGrants: roles.filter(roleId => !grants.some(grant => grant.roleId === roleId)).map(roleId => ({ roleId, permissionKey: key })), approvedSalesPartnerRoleIds: [...partnerIds] };
}
export async function provisionDemoPermissions(tx: Prisma.TransactionClient, partnerIds: readonly string[], adminOnly = false) {
  const roles = await targets(tx, partnerIds, adminOnly);
  const definition = PERMISSION_DEFINITIONS.find(item => item.key === key)!;
  const permission = await tx.permission.upsert({ where: { key }, create: { key, category: definition.category, description: definition.description }, update: {} });
  for (const roleId of roles) await tx.rolePermission.upsert({ where: { roleId_permissionId: { roleId, permissionId: permission.id } }, create: { roleId, permissionId: permission.id }, update: {} });
  return inspectDemoPermissions(tx, partnerIds, adminOnly);
}
