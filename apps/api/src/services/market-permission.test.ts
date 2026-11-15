import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma } from "../generated/prisma/client";
import { inspectMarketPermission, provisionMarketPermission } from "./market-memberships.service";

test("market permission provisioning is additive and repeatable, preserving custom grants", async () => {
  const permissions = new Map<string, { id: string }>();
  const grants = new Set(["custom-role:custom-permission"]);
  let writes = 0;
  const tx = {
    role: { findUnique: async () => ({ id: "admin", isSystem: true }) },
    permission: {
      findUnique: async ({ where }: { where: { key: string } }) => permissions.get(where.key) ?? null,
      upsert: async ({ where }: { where: { key: string } }) => { writes++; const row = permissions.get(where.key) ?? { id: where.key }; permissions.set(where.key, row); return row; },
    },
    rolePermission: {
      findUnique: async ({ where }: { where: { roleId_permissionId: { roleId: string; permissionId: string } } }) => grants.has(where.roleId_permissionId.roleId + ":" + where.roleId_permissionId.permissionId) ? {} : null,
      upsert: async ({ create }: { create: { roleId: string; permissionId: string } }) => { writes++; grants.add(create.roleId + ":" + create.permissionId); return {}; },
    },
  } as unknown as Prisma.TransactionClient;
  assert.deepEqual(await inspectMarketPermission(tx), { adminRoleReady: true, missingPermission: true, missingAdminGrant: true });
  assert.equal(writes, 0);
  await provisionMarketPermission(tx); await provisionMarketPermission(tx);
  assert.deepEqual(await inspectMarketPermission(tx), { adminRoleReady: true, missingPermission: false, missingAdminGrant: false });
  assert.equal(permissions.size, 1); assert.equal(grants.size, 2); assert.ok(grants.has("custom-role:custom-permission"));
});
