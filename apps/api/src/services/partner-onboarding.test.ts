import assert from "node:assert/strict";
import test from "node:test";
import { createUserSchema, PERMISSION_KEYS as P, type AuthUser } from "@nbs/shared";
import { installMarketStore } from "../test/market-store";
import { marketContext } from "../lib/market-context";
import { env } from "../env";
import { createUser, updateUser } from "./users.service";
import { replaceUserMarkets } from "./market-memberships.service";
import { verifyPassword } from "../lib/password";

const admin = { id: "admin", role: { id: "admin-role", name: "Admin", isSystem: true }, permissions: [P.MARKETS_MANAGE_MEMBERSHIPS, P.USERS_CREATE, P.USERS_UPDATE] } as AuthUser;
const input = () => createUserSchema.parse({ name: "Partner Fixture", email: "fixture@example.invalid", password: "fixture-password-strong", roleId: "sales-role", accountType: "PARTNER", marketCodes: ["JO", "UK"], defaultMarketCode: "JO" });
function prepare(t: Parameters<typeof installMarketStore>[0]) {
  assert.equal(new URL(env.DATABASE_URL).port, "1"); env.MARKET_ACCESS_MODE = "enforced";
  const f = installMarketStore(t); for (const role of f.tables.role!) role.permissions = [];
  for (const user of f.tables.user!) Object.assign(user, { accountType: "INTERNAL", defaultMarketCode: null, passwordHash: "existing-secret-hash", sessionVersion: 0, lastLoginAt: null, createdAt: new Date(), updatedAt: new Date() });
  return f;
}
test("onboarding creates account, markets, default and audits atomically, with hashed credentials", async t => {
  const f = prepare(t); const usersBefore = f.tables.user!.length;
  const result = await marketContext.run({ actor: () => admin }, () => createUser(input(), admin.id, admin));
  assert.equal(f.tables.user!.length, usersBefore + 1); assert.equal(result.accountType, "PARTNER"); assert.equal(result.defaultMarketCode, "JO"); assert.equal(result.initialDisplayCurrency, "JOD"); assert.deepEqual(result.marketCodes?.sort(), ["JO", "UK"]);
  const row = f.tables.user!.find(user => user.id === result.id)!; assert.ok(await verifyPassword(input().password, String(row.passwordHash)));
  assert.equal("passwordHash" in result, false); assert.ok(f.tables.auditLog!.length >= 2);
  const raw = JSON.stringify(f.tables.auditLog!); assert.ok(!raw.includes(input().password)); assert.ok(!raw.includes(String(row.passwordHash)));
});
test("invalid partner onboarding or audit outage cannot leave partial users/memberships", async t => {
  const f = prepare(t); const before = structuredClone({ users: f.tables.user!, memberships: f.tables.userSalesMarket });
  for (const invalid of [{ ...input(), marketCodes: [], defaultMarketCode: null }, { ...input(), defaultMarketCode: "US" }, { ...input(), marketCodes: ["UNKNOWN"], defaultMarketCode: "UNKNOWN" }]) await assert.rejects(marketContext.run({ actor: () => admin }, () => createUser(invalid, admin.id, admin)), { status: 400 });
  assert.deepEqual(f.tables.user!, before.users); assert.deepEqual(f.tables.userSalesMarket, before.memberships);
  f.setAuditOutage(true); await assert.rejects(marketContext.run({ actor: () => admin }, () => createUser(input(), admin.id, admin)));
  assert.deepEqual(f.tables.user!, before.users); assert.deepEqual(f.tables.userSalesMarket, before.memberships);
});
test("membership/default edits preserve credentials, ownership, sessions and reject unassigned defaults", async t => {
  const f = prepare(t); const user = f.tables.user!.find(row => row.id === "partner")!; Object.assign(user, { accountType: "PARTNER", defaultMarketCode: "JO" });
  const ownership = structuredClone(f.tables.company); const credentials = user.passwordHash; const sessionVersion = user.sessionVersion;
  await marketContext.run({ actor: () => admin }, () => updateUser("partner", { marketCodes: ["UK", "US"], defaultMarketCode: "UK" }, admin.id, admin));
  assert.equal(user.passwordHash, credentials); assert.equal(user.sessionVersion, sessionVersion); assert.deepEqual(f.tables.company, ownership); assert.equal(user.defaultMarketCode, "UK");
  await assert.rejects(marketContext.run({ actor: () => admin }, () => replaceUserMarkets("partner", ["US"], admin)), { status: 400 });
  assert.equal(user.defaultMarketCode, "UK");
  await assert.rejects(marketContext.run({ actor: () => admin }, () => replaceUserMarkets("partner", [], admin, null)), { status: 400 });
  await marketContext.run({ actor: () => admin }, () => replaceUserMarkets("partner", ["US"], admin, "US"));
  assert.equal(f.tables.user!.find(row => row.id === "partner")!.defaultMarketCode, "US");
});
test("market management requires both global Admin and explicit permission; global defaults may be unassigned", async t => {
  const f = prepare(t);
  for (const actor of [{ ...admin, permissions: [P.USERS_CREATE] }, { ...admin, role: { ...admin.role, name: "Sales" } }]) await assert.rejects(createUser(input(), actor.id, actor), { status: 403 });
  const result = await marketContext.run({ actor: () => admin }, () => createUser({ ...input(), email: "global@example.invalid", accountType: "INTERNAL", roleId: "admin-role", marketCodes: [], defaultMarketCode: "OTHER" }, admin.id, admin));
  assert.equal(result.defaultMarketCode, "OTHER"); assert.equal(result.initialDisplayCurrency, "USD"); assert.deepEqual(result.marketCodes, []);
  assert.equal(f.tables.user!.find(row => row.id === result.id)!.roleId, "admin-role");
  await assert.rejects(marketContext.run({ actor: () => admin }, () => updateUser(result.id, { roleId: "sales-role" }, admin.id, admin)), { status: 400 });
  assert.equal(f.tables.user!.find(row => row.id === result.id)!.roleId, "admin-role");
});
