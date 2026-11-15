import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma } from "../generated/prisma/client";
import { inspectSessionPermissions, provisionSessionPermissions } from "./session-permissions.service";

function fixture() {
  const permissions = new Map([
    ["custom.permission", { id: "custom", key: "custom.permission", description: "Keep custom metadata", category: "Custom" }],
    ["sessions.view", { id: "view", key: "sessions.view", description: "Keep edited metadata", category: "Governance" }],
  ]);
  const grants = new Set(["admin:custom", "custom-role:view"]);
  let writes = 0; let role: { id: string; isSystem: boolean } | null = { id: "admin", isSystem: true };
  const tx = {
    role: { findUnique: async () => role },
    permission: {
      findMany: async ({ where }: { where: { key: { in: string[] } } }) => [...permissions.values()].filter((item) => where.key.in.includes(item.key)),
      upsert: async ({ where, create }: { where: { key: string }; create: { key: string; description: string; category: string } }) => {
        writes += 1; const record = permissions.get(where.key) ?? { id: where.key, ...create }; permissions.set(where.key, record); return record;
      },
    },
    rolePermission: {
      findMany: async ({ where }: { where: { roleId: string; permission: { key: { in: string[] } } } }) => [...permissions.values()].filter((item) => where.permission.key.in.includes(item.key) && grants.has(where.roleId + ":" + item.id)).map((permission) => ({ permission })),
      upsert: async ({ create }: { create: { roleId: string; permissionId: string } }) => { writes += 1; grants.add(create.roleId + ":" + create.permissionId); return {}; },
    },
  } as unknown as Prisma.TransactionClient;
  return { tx, permissions, grants, get writes() { return writes; }, setRole: (next: typeof role) => { role = next; } };
}

test("readiness checks do not write and targeted provisioning preserves custom grants", async () => {
  const f = fixture(); const readiness = await inspectSessionPermissions(f.tx);
  assert.equal(f.writes, 0); assert.deepEqual(readiness.missingPermissions, ["sessions.revoke"]);
  assert.deepEqual(readiness.missingAdminGrants, ["sessions.view", "sessions.revoke"]);
  const after = await provisionSessionPermissions(f.tx);
  assert.deepEqual(after, { adminRoleReady: true, missingPermissions: [], missingAdminGrants: [] });
  assert.equal(f.permissions.get("sessions.view")?.description, "Keep edited metadata");
  assert.equal(f.permissions.get("custom.permission")?.description, "Keep custom metadata");
  assert.deepEqual([...f.grants].sort(), ["admin:custom", "admin:sessions.revoke", "admin:view", "custom-role:view"].sort());
  await provisionSessionPermissions(f.tx);
  assert.equal(f.permissions.size, 3); assert.equal(f.grants.size, 4);
});
test("provisioning requires an existing system Admin and never creates a role or user", async () => {
  for (const role of [null, { id: "custom-admin-name", isSystem: false }]) {
    const f = fixture(); f.setRole(role);
    await assert.rejects(provisionSessionPermissions(f.tx), /system Admin/);
    assert.equal(f.writes, 0); assert.equal(f.permissions.size, 2); assert.equal(f.grants.size, 2);
  }
});
