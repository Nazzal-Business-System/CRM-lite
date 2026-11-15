import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma } from "../generated/prisma/client";
import { inspectPricingPermissions, provisionPricingPermissions } from "./pricing-permissions.service";

function fixture() {
  const permissions = new Map([["pricing.view", { id: "view", key: "pricing.view", description: "Keep existing", category: "Pricing" }]]);
  const grants = new Set(["custom:view", "admin:unrelated", "partner:unrelated"]);
  let writes = 0;
  const tx = {
    role: { findUnique: async () => ({ id: "admin", isSystem: true }), findMany: async ({ where }: { where: { id: { in: string[] } } }) => where.id.in.filter(id => id === "partner").map(id => ({ id, name: "Approved Partner" })) },
    permission: {
      findMany: async () => [...permissions.values()],
      upsert: async ({ where, create, update }: { where: { key: string }; create: { key: string; description: string; category: string }; update: object }) => {
        assert.deepEqual(update, {}); writes++; const row = permissions.get(where.key) ?? { id: where.key, ...create }; permissions.set(where.key, row); return row;
      },
    },
    rolePermission: {
      findMany: async () => [...grants].map(entry => { const index = entry.indexOf(":"); return { roleId: entry.slice(0, index), permissionId: entry.slice(index + 1) }; }),
      upsert: async ({ create, update }: { create: { roleId: string; permissionId: string }; update: object }) => { assert.deepEqual(update, {}); writes++; grants.add(`${create.roleId}:${create.permissionId}`); return {}; },
    },
  } as unknown as Prisma.TransactionClient;
  return { tx, permissions, grants, get writes() { return writes; } };
}
test("targeted pricing provisioning is read-only in inspection, additive and idempotent", async () => {
  const f = fixture(); const plan = await inspectPricingPermissions(f.tx, ["partner"]);
  assert.equal(f.writes, 0); assert.equal(plan.missingPermissions.length, 2); assert.equal(plan.missingGrants.length, 5);
  const after = await provisionPricingPermissions(f.tx, ["partner"]); assert.deepEqual(after.missingGrants, []); assert.deepEqual(after.missingPermissions, []);
  assert.equal(f.permissions.get("pricing.view")?.description, "Keep existing");
  assert.ok(f.grants.has("custom:view")); assert.ok(f.grants.has("admin:unrelated")); assert.ok(f.grants.has("partner:unrelated"));
  assert.equal(f.grants.has("partner:pricing.estimates.view_all"), false);
  const before = [...f.grants].sort(); await provisionPricingPermissions(f.tx, ["partner"]); assert.deepEqual([...f.grants].sort(), before);
});
test("provisioning requires explicit existing approved partner roles and never assumes the Sales role", async () => {
  for (const roles of [[], ["missing"], ["admin"], ["partner", "partner"]]) {
    const f = fixture(); await assert.rejects(provisionPricingPermissions(f.tx, roles)); assert.equal(f.writes, 0);
  }
});

test("explicit Admin-only provisioning grants exactly three Admin permissions and never touches partner grants", async () => {
  const f = fixture();
  const plan = await inspectPricingPermissions(f.tx, [], true);
  assert.equal(plan.missingGrants.length, 3);
  assert.ok(plan.missingGrants.every(grant => grant.roleId === "admin"));
  assert.equal(f.writes, 0);
  const beforePartners = [...f.grants].filter(grant => !grant.startsWith("admin:")).sort();
  const after = await provisionPricingPermissions(f.tx, [], true);
  assert.deepEqual(after.missingGrants, []);
  assert.deepEqual([...f.grants].filter(grant => !grant.startsWith("admin:")).sort(), beforePartners);
  await assert.rejects(provisionPricingPermissions(f.tx, ["partner"], true));
  const count = f.grants.size; await provisionPricingPermissions(f.tx, [], true); assert.equal(f.grants.size, count);
});
