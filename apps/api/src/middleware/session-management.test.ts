import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import type { AddressInfo } from "node:net";
import { PERMISSION_KEYS, PERMISSION_DEFINITIONS, SALES_DEFAULT_PERMISSIONS } from "@nbs/shared";
await import("../load-env");
const { env } = await import("../env");
const { createApp } = await import("../app");
const { sessionStore } = await import("../test/session-store");
const { createLoginSession } = await import("../services/sessions.service");
const { signAccessToken } = await import("../lib/jwt");

type ListPayload = { data: { items: Array<{ id: string; isCurrent: boolean; status: string; device: { browser: string }; user?: { id: string } }>; total: number; page: number; pageSize: number } };
async function setup(t: TestContext) {
  const store = sessionStore(t);
  const current = await createLoginSession(store.user.id, store.user.passwordHash, "Mozilla/5.0 (Windows NT 10.0) Chrome/130.0");
  const otherUser = store.addUser({ id: "other-user", name: "Other Agent", email: "other@example.com", role: { ...store.user.role, permissions: [] } });
  const foreign = await createLoginSession(otherUser.id, otherUser.passwordHash);
  const server = createApp().listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  t.after(() => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const request = (path: string, token: string | null = current.token, method = "GET", body?: unknown) => fetch(`${origin}/api${path}`, {
    method, headers: { ...(token ? { cookie: `${env.COOKIE_NAME}=${token}` } : {}), ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const grant = (...keys: string[]) => store.setUser({ role: { ...store.user.role, permissions: keys.map((key) => ({
    roleId: store.user.roleId, permissionId: key, permission: { id: key, key, description: key, category: "Governance" },
  })) } });
  return { store, current, otherUser, foreign, request, grant };
}

test("anonymous and unauthorized callers cannot enumerate or revoke sessions", async (t) => {
  const { store, current, otherUser, foreign, request } = await setup(t);
  assert.equal((await request("/auth/sessions", null)).status, 401);
  assert.equal((await request("/admin/sessions", null)).status, 401);
  assert.equal((await request("/admin/sessions")).status, 403);
  assert.equal((await request(`/admin/users/${otherUser.id}/sessions/${foreign.session.id}`, current.token, "DELETE")).status, 403);
  assert.equal(store.lastListArgs, undefined);
  assert.equal(store.audits.length, 0);
  assert.equal(store.rows.get(foreign.session.tokenHash)?.revokedAt, null);
});

test("self listing is scoped, paginated, identifies current session, and never returns credentials", async (t) => {
  const { store, current, foreign, request } = await setup(t);
  await createLoginSession(store.user.id, store.user.passwordHash);
  store.rows.set(current.session.tokenHash, { ...current.session, userAgent: "<script>" + current.token + "</script> Chrome/130.0" });
  const response = await request("/auth/sessions");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const text = await response.text();
  const payload = JSON.parse(text) as ListPayload;
  assert.equal(payload.data.total, 2);
  assert.equal(payload.data.items.filter((row) => row.isCurrent).length, 1);
  assert.equal(payload.data.items.find((row) => row.isCurrent)?.id, current.session.id);
  assert.equal(payload.data.items.find((row) => row.isCurrent)?.device.browser, "Chrome");
  assert.ok(!payload.data.items.some((row) => row.id === foreign.session.id));
  assert.ok(!text.includes("tokenHash") && !text.includes("passwordHash") && !text.includes("userAgent") && !text.includes("sessionVersion"));
  assert.ok(!text.includes(current.token) && !text.includes(current.session.tokenHash));
  assert.equal(store.lastListArgs?.select?.tokenHash, undefined);
  const page = await request("/auth/sessions?page=2&pageSize=1");
  assert.equal(((await page.json()) as ListPayload).data.items.length, 1);
  for (const query of ["userId=other-user", "pageSize=101", "page=0", "page=1&page=2"]) {
    assert.equal((await request(`/auth/sessions?${query}`)).status, 400);
  }
  assert.equal((await request("/auth/sessions/revoke-others", current.token, "POST", { userId: "other-user" })).status, 400);
});

test("self revocation enforces ownership, is idempotent, and takes effect on next request", async (t) => {
  const { store, current, foreign, request } = await setup(t);
  const own = await createLoginSession(store.user.id, store.user.passwordHash);
  const foreignResponse = await request(`/auth/sessions/${foreign.session.id}`, current.token, "DELETE");
  const missingResponse = await request("/auth/sessions/unknown-id", current.token, "DELETE");
  assert.equal(foreignResponse.status, 404);
  assert.equal(missingResponse.status, 404);
  assert.deepEqual(await foreignResponse.json(), await missingResponse.json());
  assert.equal((await request(`/auth/sessions/${own.session.id}`, current.token, "DELETE")).status, 200);
  assert.equal((await request("/auth/me", own.token)).status, 401);
  assert.equal((await request("/auth/me", foreign.token)).status, 200);
  assert.equal((await request("/auth/me", current.token)).status, 200);
  const repeat = await request(`/auth/sessions/${own.session.id}`, current.token, "DELETE");
  assert.equal(repeat.status, 200);
  assert.equal(((await repeat.json()) as { data: { revokedCount: number } }).data.revokedCount, 0);
  assert.equal(store.audits.length, 1);
});

test("revoking current session clears its cookie and rejects its credential", async (t) => {
  const { current, request } = await setup(t);
  const result = await request(`/auth/sessions/${current.session.id}`, current.token, "DELETE");
  assert.equal(result.status, 200);
  assert.ok((result.headers.get("set-cookie") ?? "").includes("Expires=Thu, 01 Jan 1970"));
  assert.equal((await request("/auth/me")).status, 401);
});

test("revoke others preserves current legacy session and blocks unadopted JWT resurrection", async (t) => {
  const { store, foreign, request } = await setup(t);
  env.SESSION_TOKEN_MODE = "legacy";
  const preserved = await createLoginSession(store.user.id, store.user.passwordHash);
  const legacyListing = await request("/auth/sessions", preserved.token);
  const legacyItems = ((await legacyListing.json()) as ListPayload).data.items;
  assert.equal(legacyItems.find((row) => row.isCurrent)?.id, preserved.session.id);
  const untracked = signAccessToken(store.user.id);
  env.SESSION_TOKEN_MODE = "opaque";
  const other = await createLoginSession(store.user.id, store.user.passwordHash);
  const response = await request("/auth/sessions/revoke-others", preserved.token, "POST");
  assert.equal(response.status, 200);
  assert.equal((await request("/auth/me", other.token)).status, 401);
  assert.equal((await request("/auth/me", untracked)).status, 401);
  assert.equal((await request("/auth/me", preserved.token)).status, 200);
  assert.equal((await request("/auth/me", foreign.token)).status, 200);
  const subsequent = await createLoginSession(store.user.id, store.user.passwordHash);
  assert.equal((await request("/auth/me", subsequent.token)).status, 200);
});

test("admin view and revoke permissions are independent and audit identifies actor and owner", async (t) => {
  const { store, current, foreign, otherUser, request, grant } = await setup(t);
  grant(PERMISSION_KEYS.SESSIONS_VIEW);
  const listing = await request("/admin/sessions");
  assert.equal(listing.status, 200);
  assert.equal(((await listing.json()) as ListPayload).data.total, 2);
  assert.equal((await request(`/admin/users/${otherUser.id}/sessions/${foreign.session.id}`, current.token, "DELETE")).status, 403);
  grant(PERMISSION_KEYS.SESSIONS_REVOKE);
  assert.equal((await request("/admin/sessions")).status, 403);
  assert.equal((await request(`/admin/users/${store.user.id}/sessions/${foreign.session.id}`, current.token, "DELETE")).status, 404);
  const result = await request(`/admin/users/${otherUser.id}/sessions/${foreign.session.id}`, current.token, "DELETE");
  assert.equal(result.status, 200);
  assert.equal((await request("/auth/me", foreign.token)).status, 401);
  assert.equal((await request("/auth/me", current.token)).status, 200);
  assert.equal(store.audits.length, 1);
  assert.equal((await request(`/admin/users/${"x".repeat(129)}/sessions/${foreign.session.id}`, current.token, "DELETE")).status, 400);
  assert.equal(store.audits[0]?.action, "ADMIN_SESSION_REVOKED");
  assert.equal(store.audits[0]?.actorUserId, store.user.id);
  assert.equal(store.audits[0]?.entityId, foreign.session.id);
  assert.deepEqual(store.audits[0]?.metadata, { targetUserId: otherUser.id });
  const auditText = JSON.stringify(store.audits);
  assert.ok(!auditText.includes(foreign.token) && !auditText.includes(foreign.session.tokenHash));
});

test("admin filters apply before pagination and serialization reports inactive states accurately", async (t) => {
  const { store, current, foreign, otherUser, request, grant } = await setup(t);
  grant(PERMISSION_KEYS.SESSIONS_VIEW);
  env.SESSION_TOKEN_MODE = "legacy";
  const legacy = await createLoginSession(otherUser.id, otherUser.passwordHash);
  env.SESSION_TOKEN_MODE = "opaque";
  store.rows.set(legacy.session.tokenHash, { ...legacy.session, revokedAt: new Date() });
  store.rows.set(foreign.session.tokenHash, { ...foreign.session, idleExpiresAt: new Date(Date.now() - 1) });
  const filtered = await request(`/admin/sessions?userId=${otherUser.id}&revoked=false&isLegacy=false&search=OTHER&pageSize=1`);
  assert.equal(filtered.status, 200);
  const data = ((await filtered.json()) as ListPayload).data;
  assert.equal(data.total, 1);
  assert.equal(data.items[0]?.id, foreign.session.id);
  assert.equal(data.items[0]?.status, "EXPIRED");
  assert.equal(data.items[0]?.user?.id, otherUser.id);
  const revoked = await request(`/admin/sessions?userId=${otherUser.id}&revoked=true&isLegacy=true`);
  assert.equal(((await revoked.json()) as ListPayload).data.items[0]?.status, "REVOKED");
  store.addUser({ ...otherUser, isActive: false });
  const disabled = await request(`/admin/sessions?userId=${otherUser.id}&revoked=false`);
  assert.equal(((await disabled.json()) as ListPayload).data.items[0]?.status, "INVALIDATED");
  assert.equal((await request("/admin/sessions?createdFrom=2099-01-01T00:00:00Z")).status, 200);
  const empty = await request("/admin/sessions?createdFrom=2099-01-01T00:00:00Z");
  assert.equal(((await empty.json()) as ListPayload).data.total, 0);
  for (const query of ["revoked=maybe", "isLegacy=1", "search=" + "x".repeat(201), "createdFrom=invalid", "createdFrom=2027-01-01T00:00:00Z&createdTo=2026-01-01T00:00:00Z", "pageSize=101"]) {
    assert.equal((await request(`/admin/sessions?${query}`)).status, 400);
  }
  assert.equal((await request(`/admin/users/${"x".repeat(129)}/sessions/${current.session.id}`, current.token, "DELETE")).status, 403);
});

test("management outages return 503 and failed audit rolls back revocation and legacy cutoff", async (t) => {
  const { store, current, foreign, otherUser, request, grant } = await setup(t);
  grant(PERMISSION_KEYS.SESSIONS_VIEW, PERMISSION_KEYS.SESSIONS_REVOKE);
  store.setManagementOutage(true);
  for (const path of ["/auth/sessions", "/admin/sessions"]) {
    const response = await request(path);
    assert.equal(response.status, 503);
    assert.equal(((await response.json()) as { error: { code: string } }).error.code, "SERVICE_UNAVAILABLE");
    assert.ok(!(response.headers.get("set-cookie") ?? "").includes("Expires=Thu, 01 Jan 1970"));
  }
  store.setManagementOutage(false);
  store.setTouchOutage(true);
  assert.equal((await request(`/admin/users/${otherUser.id}/sessions/${foreign.session.id}`, current.token, "DELETE")).status, 503);
  assert.equal(store.rows.get(foreign.session.tokenHash)?.revokedAt, null);
  store.setTouchOutage(false);
  store.setAuditOutage(true);
  const failed = await request(`/admin/users/${otherUser.id}/sessions/${foreign.session.id}`, current.token, "DELETE");
  assert.equal(failed.status, 503);
  assert.equal(store.rows.get(foreign.session.tokenHash)?.revokedAt, null);
  const own = await createLoginSession(store.user.id, store.user.passwordHash);
  assert.equal((await request("/auth/sessions/revoke-others", current.token, "POST")).status, 503);
  assert.equal(store.user.legacyInvalidBefore, null);
  assert.equal(store.rows.get(own.session.tokenHash)?.revokedAt, null);
  store.setAuditOutage(false);
  assert.equal((await request("/auth/sessions")).status, 200);
  assert.equal((await request("/auth/me", foreign.token)).status, 200);
  assert.equal((await request("/auth/me", current.token)).status, 200);
  assert.equal(store.audits.length, 0);
});

test("session-management privileges are catalogued separately and not granted to Sales", () => {
  for (const key of [PERMISSION_KEYS.SESSIONS_VIEW, PERMISSION_KEYS.SESSIONS_REVOKE]) {
    assert.ok(PERMISSION_DEFINITIONS.some((entry) => entry.key === key));
    assert.ok(!SALES_DEFAULT_PERMISSIONS.includes(key));
  }
  assert.ok(PERMISSION_KEYS.SESSIONS_VIEW !== (PERMISSION_KEYS.SESSIONS_REVOKE as string));
});

test("an administrator can revoke their current session with the same durable semantics", async (t) => {
  const { store, current, request, grant } = await setup(t);
  grant(PERMISSION_KEYS.SESSIONS_REVOKE);
  const response = await request(`/admin/users/${store.user.id}/sessions/${current.session.id}`, current.token, "DELETE");
  assert.equal(response.status, 200);
  assert.ok((response.headers.get("set-cookie") ?? "").includes("Expires=Thu, 01 Jan 1970"));
  assert.equal((await request("/auth/me")).status, 401);
  assert.equal(store.audits[0]?.action, "ADMIN_SESSION_REVOKED");
});
