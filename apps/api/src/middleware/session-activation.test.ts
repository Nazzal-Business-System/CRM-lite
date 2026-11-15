import assert from "node:assert/strict";
import test from "node:test";
import type { AddressInfo } from "node:net";
await import("../load-env");
const { createApp } = await import("../app");
const { sessionStore } = await import("../test/session-store");
const { env } = await import("../env");
const { createLoginSession, hashSessionToken, IDLE_MS, ABSOLUTE_MS } = await import("../services/sessions.service");
const { hashPassword } = await import("../lib/password");

test("opaque activation preserves legacy access and independent HTTP login/logout sessions", async (t) => {
  // All persistence is mocked; the test runner also supplies an unreachable DB URL.
  const store = sessionStore(t);
  const password = "Isolated-activation-password-123!";
  store.setUser({ passwordHash: await hashPassword(password) });
  env.SESSION_TOKEN_MODE = "legacy";
  const legacy = await createLoginSession(store.user.id, store.user.passwordHash);
  env.SESSION_TOKEN_MODE = "opaque";
  assert.equal(env.ACCEPT_LEGACY_JWT, "true");
  const server = createApp().listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  t.after(() => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const login = async () => {
    const response = await fetch(`${origin}/api/auth/login`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: store.user.email, password }),
    });
    assert.equal(response.status, 200);
    const header = response.headers.get("set-cookie") ?? "";
    assert.ok(header.includes("HttpOnly"), "cookie remains HttpOnly");
    assert.ok(header.includes("SameSite=Lax"), "cookie retains SameSite");
    const cookie = header.split(";", 1)[0] ?? "";
    assert.ok(Boolean(cookie), "login returns a cookie");
    const token = decodeURIComponent(cookie.slice(cookie.indexOf("=") + 1));
    // Boolean assertions avoid exposing credentials in failure diagnostics.
    assert.ok(/^nbs_s1_[A-Za-z0-9_-]{43}$/.test(token), "fresh login uses opaque credential");
    const row = store.rows.get(hashSessionToken(token));
    assert.ok(row && !row.isLegacy, "fresh login persists an opaque record");
    assert.equal(row.idleExpiresAt.getTime() - row.createdAt.getTime(), IDLE_MS);
    assert.equal(row.absoluteExpiresAt.getTime() - row.createdAt.getTime(), ABSOLUTE_MS);
    return { cookie, row };
  };
  const [first, second] = await Promise.all([login(), login()]);
  assert.ok(first.row.id !== second.row.id, "concurrent sessions are independent");
  const me = (cookie: string) => fetch(`${origin}/api/auth/me`, { headers: { cookie } });
  assert.equal((await me(first.cookie)).status, 200);
  assert.equal((await me(second.cookie)).status, 200);
  const legacyCookie = `${env.COOKIE_NAME}=${legacy.token}`;
  assert.equal((await me(legacyCookie)).status, 200);
  const logout = await fetch(`${origin}/api/auth/logout`, { method: "POST", headers: { cookie: first.cookie } });
  assert.equal(logout.status, 200);
  assert.ok((logout.headers.get("set-cookie") ?? "").includes("Expires=Thu, 01 Jan 1970"), "logout clears browser cookie");
  assert.ok(store.rows.get(first.row.tokenHash)?.revokedAt, "logout persists revocation");
  assert.equal((await me(first.cookie)).status, 401);
  assert.equal((await me(second.cookie)).status, 200);
  assert.equal((await me(legacyCookie)).status, 200);
});
