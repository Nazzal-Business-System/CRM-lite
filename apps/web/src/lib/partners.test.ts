import assert from "node:assert/strict";
import test from "node:test";
import { canManagePartnerPriceBooks, partnerPriceBookOptions } from "./partner-price-books";
import { marketDisplayCurrency, PERMISSION_KEYS as P, createUserSchema, type AuthUser } from "@nbs/shared";
import { partnerPayload, partnerSetupError, partnerFormDirty, partnerDismissal, partnerSaveOptions, type PartnerForm } from "./partners";
import { QueryClient } from "@tanstack/react-query";
import { api, ApiError } from "./api";
import { visibleNavSections } from "./navigation";
import { enMessages } from "../i18n/messages/en";
import { arMessages } from "../i18n/messages/ar";
const admin = { id: "admin", permissions: [P.MARKETS_MANAGE_MEMBERSHIPS], role: { name: "Admin", isSystem: true } } as AuthUser;
const form: PartnerForm = { name: "Fixture", email: "fixture@example.invalid", password: "fixture-password", roleId: "role", accountType: "PARTNER", marketCodes: ["JO", "UK"], defaultMarketCode: "UK" };

test("partner pricing is explicitly selected, independently authorized, validated and tracked as dirty", () => {
  const manager = { ...admin, permissions: [...admin.permissions, P.PRICING_PRICEBOOKS_MANAGE] };
  const priceBookAccess = { scope: "selected" as const, bookIds: ["JO" as const], defaultBookId: "JO" as const };
  assert.equal(canManagePartnerPriceBooks(manager), true);
  assert.equal(canManagePartnerPriceBooks(admin), false);
  assert.equal(canManagePartnerPriceBooks({ ...manager, role: { ...manager.role, isSystem: false } }), false);
  assert.equal(partnerPriceBookOptions(admin, "partner").enabled, false);
  assert.equal(partnerPriceBookOptions(manager, "partner").enabled, true);
  assert.equal("priceBookAccess" in partnerPayload(form, manager, false, false), false);
  const withBooks = { ...form, priceBookAccess };
  assert.deepEqual(partnerPayload(withBooks, manager, false, false).priceBookAccess, priceBookAccess);
  assert.equal(partnerFormDirty(withBooks, form), true);
  assert.throws(() => partnerPayload(withBooks, admin, false, false), { status: 403 });
  assert.throws(() => partnerPayload({ ...withBooks, priceBookAccess: { ...priceBookAccess, defaultBookId: "US" } }, manager, false, false));
  assert.throws(() => partnerPayload({ ...withBooks, priceBookAccess: { ...priceBookAccess, bookIds: ["JO", "JO"] } }, manager, false, false));
});

test("unmodified pricing access is omitted from account edits, while explicit book edits are submitted atomically", async t => {
  const manager = { ...admin, permissions: [...admin.permissions, P.PRICING_PRICEBOOKS_MANAGE] };
  const initial: PartnerForm = { ...form, password: "", priceBookAccess: { scope: "selected", bookIds: ["JO"], defaultBookId: "JO" } };
  const client = new QueryClient(); t.after(() => client.clear());
  const payloads: Array<Record<string, unknown>> = [];
  t.mock.method(api, "patch", async (_path: string, body: Record<string, unknown>) => { payloads.push(body); return {}; });
  const save = partnerSaveOptions(client, { viewer: manager, targetId: "partner", initial, global: false, onSaved() {}, notify() {} });
  await save.mutationFn({ ...initial, name: "Name changed" });
  assert.equal("priceBookAccess" in payloads[0], false);
  await save.mutationFn({ ...initial, priceBookAccess: { scope: "selected", bookIds: ["JO", "UK"], defaultBookId: "UK" } });
  assert.deepEqual(payloads[1].priceBookAccess, { scope: "selected", bookIds: ["JO", "UK"], defaultBookId: "UK" });
});
test("default display currency is a market preference and partner defaults stay within assigned markets", () => {
  assert.deepEqual(["JO", "UK", "US", "OTHER"].map(marketDisplayCurrency), ["JOD", "GBP", "USD", "USD"]); assert.equal(marketDisplayCurrency(null), null);
  assert.equal(partnerSetupError(form, false), null); assert.equal(partnerSetupError({ ...form, defaultMarketCode: "US" }, false), "partners.defaultRequired");
  assert.equal(partnerSetupError({ ...form, marketCodes: [], defaultMarketCode: null }, false), "partners.marketsRequired"); assert.equal(partnerSetupError({ ...form, marketCodes: [], defaultMarketCode: "OTHER" }, true), null);
});
test("onboarding submits one atomic payload and unauthorized editors cannot submit market changes", () => {
  const payload = partnerPayload(form, admin, false, false); assert.deepEqual(payload.marketCodes, ["JO", "UK"]); assert.equal(payload.defaultMarketCode, "UK");
  assert.throws(() => partnerPayload(form, { ...admin, permissions: [] }, false, false));
  const ordinary = partnerPayload({ ...form, accountType: "INTERNAL", password: "" }, { ...admin, permissions: [] }, true, false);
  assert.ok(!("marketCodes" in ordinary)); assert.ok(!("defaultMarketCode" in ordinary)); assert.ok(!("password" in ordinary));
  assert.equal(createUserSchema.safeParse({ ...form, marketCodes: ["JO", "jo"] }).success, false);
});
test("partner workspace retains user RBAC navigation and retires recruitment; EN/AR fields match", () => {
  const sections = visibleNavSections([P.USERS_VIEW, P.RECRUITMENT_VIEW]); const links = sections.flatMap(section => section.items);
  assert.ok(links.some(item => item.href === "/admin/users" && item.label === "Partners")); assert.ok(!links.some(item => item.href === "/admin/recruitment"));
  const paths = (value: object): string[] => Object.keys(value).sort(); assert.deepEqual(paths(enMessages.partners), paths(arMessages.partners));
});

test("dirty dismissal covers each form field, restored values and submission locks", () => {
  assert.equal(partnerFormDirty({ ...form, marketCodes: ["UK", "JO"] }, form), false);
  assert.equal(partnerDismissal({ dirty: false, busy: false }), "close");
  for (const patch of [{ name: "Changed" }, { email: "changed@example.invalid" }, { password: "new-password" }, { roleId: "other" }, { accountType: "INTERNAL" as const }, { marketCodes: ["JO"] }, { defaultMarketCode: "JO" }]) {
    const changed = { ...form, ...patch };
    assert.equal(partnerFormDirty(changed, form), true);
    assert.equal(partnerDismissal({ dirty: partnerFormDirty(changed, form), busy: false }), "confirm");
    assert.equal(partnerDismissal({ dirty: true, busy: true }), "blocked");
    assert.equal(partnerFormDirty({ ...changed, ...form }, form), false);
  }
  assert.equal(partnerDismissal({ dirty: false, busy: true }), "blocked");
});

test("modal create/edit saves once, refreshes list and identity, then closes; failures preserve drafts", async t => {
  const calls: Array<{ path: string; method: string; body: unknown }> = []; let fail = false;
  t.mock.method(api, "post", async (path: string, body: unknown) => { calls.push({ path, method: "POST", body }); if (fail) throw new ApiError(503, "UNAVAILABLE", "Fixture outage"); return { user: { id: "created" } }; });
  t.mock.method(api, "patch", async (path: string, body: unknown) => { calls.push({ path, method: "PATCH", body }); return { user: { id: "edited" } }; });
  const client = new QueryClient(); t.after(() => client.clear()); const events: string[] = [];
  t.mock.method(client, "invalidateQueries", async ({ queryKey }: { queryKey: string[] }) => { events.push(`refresh:${queryKey.join("/")}`); });
  const options = { viewer: admin, global: false, onSaved: () => { events.push("close"); }, notify: (key: string) => { events.push(key); } };
  const create = partnerSaveOptions(client, options);
  const snapshot = structuredClone(form); fail = true;
  await assert.rejects(create.mutationFn(form), { status: 503 }); assert.deepEqual(form, snapshot); assert.equal(events.length, 0);
  fail = false; const result = await create.mutationFn(form); await create.onSuccess(result, form);
  assert.equal(calls.at(-1)?.method, "POST"); assert.equal(calls.at(-1)?.path, "/users");
  assert.deepEqual(calls.at(-1)?.body, partnerPayload(form, admin, false, false));
  assert.ok(events.includes("refresh:users")); assert.ok(events.includes("refresh:auth/me")); assert.equal(events.at(-1), "close");
  const edit = partnerSaveOptions(client, { ...options, targetId: "edited/id" }); const edited = { ...form, password: "" };
  await edit.onSuccess(await edit.mutationFn(edited), edited);
  assert.equal(calls.at(-1)?.path, "/users/edited%2Fid"); assert.equal(calls.at(-1)?.method, "PATCH");
  assert.ok(!("password" in (calls.at(-1)?.body as object))); assert.equal(events.at(-1), "close"); assert.ok(events.includes("partners.updated"));
  const before = calls.length;
  await assert.rejects(async () => create.mutationFn({ ...form, marketCodes: [], defaultMarketCode: null }), { status: 400 });
  assert.equal(calls.length, before);
});
