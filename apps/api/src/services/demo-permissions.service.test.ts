import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma } from "../generated/prisma/client";
import { inspectDemoPermissions, provisionDemoPermissions } from "./demo-permissions.service";
function fixture() {
  const grants = new Set(["custom:existing", "admin:unrelated", "partner:existing"]); let permission: { id: string } | null = null; let writes = 0;
  const tx = { role: { findUnique: async () => ({ id: "admin", isSystem: true }), findMany: async ({ where }: { where: { id: { in: string[] } } }) => where.id.in.filter(id => id === "partner").map(id => ({ id })) },
    permission: { findUnique: async () => permission, upsert: async ({ update }: { update: object }) => { assert.deepEqual(update, {}); writes++; return permission ??= { id: "demo-view" }; } },
    rolePermission: { findMany: async ({ where }: { where: { permissionId: string } }) => [...grants].filter(item => item.endsWith(":" + where.permissionId)).map(item => ({ roleId: item.split(":")[0] })), upsert: async ({ create, update }: { create: { roleId: string; permissionId: string }; update: object }) => { assert.deepEqual(update, {}); writes++; grants.add(`${create.roleId}:${create.permissionId}`); return {}; } },
  } as unknown as Prisma.TransactionClient;
  return { tx, grants, get writes() { return writes; } };
}
test("demo provisioning is inspectable, additive, targeted and idempotent", async () => {
  const f = fixture(); const check = await inspectDemoPermissions(f.tx, ["partner"]); assert.equal(f.writes, 0); assert.deepEqual(check.missingPermissions, ["demos.view"]); assert.equal(check.missingGrants.length, 2);
  await provisionDemoPermissions(f.tx, ["partner"]); const before = [...f.grants].sort(); await provisionDemoPermissions(f.tx, ["partner"]); assert.deepEqual([...f.grants].sort(), before);
  assert.ok(f.grants.has("custom:existing")); assert.ok(f.grants.has("admin:unrelated")); assert.ok(f.grants.has("partner:existing")); assert.equal(f.grants.size, 5);
  assert.deepEqual((await inspectDemoPermissions(f.tx, ["partner"])).missingGrants, []);
  const admin = fixture(); await provisionDemoPermissions(admin.tx, [], true); assert.ok(admin.grants.has("admin:demo-view")); assert.ok(!admin.grants.has("partner:demo-view"));
});
test("demo provisioning rejects implicit, missing or duplicate partner roles before any write", async () => {
  for (const ids of [[], ["missing"], ["admin"], ["partner", "partner"]]) { const f = fixture(); await assert.rejects(provisionDemoPermissions(f.tx, ids)); assert.equal(f.writes, 0); }
  const f = fixture(); await assert.rejects(provisionDemoPermissions(f.tx, ["partner"], true)); assert.equal(f.writes, 0);
});
