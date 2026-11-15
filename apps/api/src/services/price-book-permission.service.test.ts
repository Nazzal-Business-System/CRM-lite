import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma } from "../generated/prisma/client";
import { inspectPriceBookPermission, provisionPriceBookPermission } from "./price-book-permission.service";
test("targeted price-book management provisioning is idempotent, Admin-only and preserves other role grants", async () => {
    let permission: {
        id: string;
        key: string;
    } | null = null;
    let grant: unknown = null;
    const calls: unknown[] = [];
    const others = [{ roleId: "custom", permissionId: "existing" }];
    const before = structuredClone(others);
    const tx = { role: { findUnique: async () => ({ id: "admin-role", isSystem: true }) }, permission: { findUnique: async () => permission, upsert: async (args: {
                create: {
                    key: string;
                };
                update: object;
            }) => { calls.push(args); assert.deepEqual(args.update, {}); assert.equal(args.create.key, "pricing.pricebooks.manage"); return permission ??= { id: "book-permission", key: args.create.key }; } }, rolePermission: { findUnique: async () => grant, upsert: async (args: {
                create: {
                    roleId: string;
                    permissionId: string;
                };
                update: object;
            }) => { calls.push(args); assert.equal(args.create.roleId, "admin-role"); assert.deepEqual(args.update, {}); return grant ??= args.create; } } } as unknown as Prisma.TransactionClient;
    assert.deepEqual((await inspectPriceBookPermission(tx)).missingPermissions, ["pricing.pricebooks.manage"]);
    assert.equal(calls.length, 0);
    for (let i = 0; i < 2; i++) {
        const result = await provisionPriceBookPermission(tx);
        assert.deepEqual(result.missingPermissions, []);
        assert.deepEqual(result.missingGrants, []);
    }
    assert.deepEqual(others, before);
    assert.deepEqual(permission, { id: "book-permission", key: "pricing.pricebooks.manage" });
});
