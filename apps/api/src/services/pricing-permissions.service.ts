import { PERMISSION_DEFINITIONS, PERMISSION_KEYS } from "@nbs/shared";
import type { Prisma } from "../generated/prisma/client";
import { badRequest } from "../lib/errors";

const view = PERMISSION_KEYS.PRICING_VIEW;
const create = PERMISSION_KEYS.PRICING_ESTIMATES_CREATE;
const viewAll = PERMISSION_KEYS.PRICING_ESTIMATES_VIEW_ALL;
const keys = [view, create, viewAll];
async function targets(tx: Prisma.TransactionClient, salesPartnerRoleIds: readonly string[], adminOnly: boolean) {
  if ((adminOnly ? salesPartnerRoleIds.length !== 0 : !salesPartnerRoleIds.length) || salesPartnerRoleIds.length > 20 || new Set(salesPartnerRoleIds).size !== salesPartnerRoleIds.length) throw badRequest("Choose Admin-only or unique, explicitly approved Sales Partner role IDs.");
  const admin = await tx.role.findUnique({ where: { name: "Admin" }, select: { id: true, isSystem: true } });
  if (!admin?.isSystem) throw badRequest("An existing system Admin role is required.");
  const partners = adminOnly ? [] : await tx.role.findMany({ where: { id: { in: [...salesPartnerRoleIds] } }, select: { id: true, name: true } });
  if (partners.length !== salesPartnerRoleIds.length || salesPartnerRoleIds.includes(admin.id)) throw badRequest("Every approved Sales Partner role must exist and be distinct from system Admin.");
  return [{ roleId: admin.id, keys }, ...partners.map(role => ({ roleId: role.id, keys: [view, create] }))];
}
export async function inspectPricingPermissions(tx: Prisma.TransactionClient, salesPartnerRoleIds: readonly string[], adminOnly = false) {
  const grants = await targets(tx, salesPartnerRoleIds, adminOnly);
  const permissions = await tx.permission.findMany({ where: { key: { in: keys } }, select: { id: true, key: true } });
  const existing = await tx.rolePermission.findMany({ where: { roleId: { in: grants.map(g => g.roleId) } }, select: { roleId: true, permissionId: true } });
  const missingPermissions = keys.filter(key => !permissions.some(p => p.key === key));
  const missingGrants = grants.flatMap(grant => grant.keys.filter(key => {
    const permission = permissions.find(p => p.key === key);
    return !permission || !existing.some(row => row.roleId === grant.roleId && row.permissionId === permission.id);
  }).map(permissionKey => ({ roleId: grant.roleId, permissionKey })));
  return { missingPermissions, missingGrants, approvedSalesPartnerRoleIds: [...salesPartnerRoleIds] };
}
export async function provisionPricingPermissions(tx: Prisma.TransactionClient, salesPartnerRoleIds: readonly string[], adminOnly = false) {
  const grants = await targets(tx, salesPartnerRoleIds, adminOnly);
  for (const key of keys) {
    const definition = PERMISSION_DEFINITIONS.find(p => p.key === key)!;
    const permission = await tx.permission.upsert({ where: { key }, create: { key, description: definition.description, category: definition.category }, update: {} });
    for (const grant of grants.filter(g => g.keys.includes(key))) {
      await tx.rolePermission.upsert({ where: { roleId_permissionId: { roleId: grant.roleId, permissionId: permission.id } }, create: { roleId: grant.roleId, permissionId: permission.id }, update: {} });
    }
  }
  return inspectPricingPermissions(tx, salesPartnerRoleIds, adminOnly);
}
