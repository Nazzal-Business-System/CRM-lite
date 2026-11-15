import { PERMISSION_DEFINITIONS, PERMISSION_KEYS } from "@nbs/shared";
import type { Prisma } from "../generated/prisma/client";
import { badRequest } from "../lib/errors";
const key = PERMISSION_KEYS.PRICING_PRICEBOOKS_MANAGE;
async function admin(tx: Prisma.TransactionClient) { const role = await tx.role.findUnique({ where: { name: "Admin" }, select: { id: true, isSystem: true } }); if (!role?.isSystem)
    throw badRequest("An existing system Admin role is required."); return role; }
export async function inspectPriceBookPermission(tx: Prisma.TransactionClient) { const role = await admin(tx); const permission = await tx.permission.findUnique({ where: { key } }); const grant = permission ? await tx.rolePermission.findUnique({ where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } } }) : null; return { missingPermissions: permission ? [] : [key], missingGrants: grant ? [] : [{ roleId: role.id, permissionKey: key }] }; }
export async function provisionPriceBookPermission(tx: Prisma.TransactionClient) { const role = await admin(tx); const definition = PERMISSION_DEFINITIONS.find(p => p.key === key)!; const permission = await tx.permission.upsert({ where: { key }, create: { key, description: definition.description, category: definition.category }, update: {} }); await tx.rolePermission.upsert({ where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } }, create: { roleId: role.id, permissionId: permission.id }, update: {} }); return inspectPriceBookPermission(tx); }
