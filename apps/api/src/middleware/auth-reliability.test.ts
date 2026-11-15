import assert from "node:assert/strict";
import test from "node:test";
import jwt from "jsonwebtoken";
import type { AddressInfo } from "node:net";

await import("../load-env");
const { createApp } = await import("../app");
const { sessionStore } = await import("../test/session-store");
const { createLoginSession } = await import("../services/sessions.service");
const { env } = await import("../env");

test("authentication outages preserve cookies, recover, and still clear local logout", async (t) => {
  const store = sessionStore(t);
  const session = await createLoginSession(store.user.id, store.user.passwordHash);
  const server = createApp().listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  t.after(() => new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve())));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const cookie = `${env.COOKIE_NAME}=${session.token}`;
  const me = () => fetch(`${origin}/api/auth/me`, { headers: { cookie } });

  assert.equal((await me()).status, 200);
  store.setOutage(true);
  for (const path of ["/auth/me", "/companies"]) {
    const response = await fetch(`${origin}/api${path}`, { headers: { cookie } });
    assert.equal(response.status, 503);
    assert.equal(((await response.json()) as { error: { code: string } }).error.code, "SERVICE_UNAVAILABLE");
    assert.equal(response.headers.get("set-cookie"), null);
  }
  const failedLogin = await fetch(`${origin}/api/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: store.user.email, password: "Some-password-123!" }),
  });
  assert.equal(failedLogin.status, 503);
  assert.equal(failedLogin.headers.get("set-cookie"), null);
  const logout = await fetch(`${origin}/api/auth/logout`, { method: "POST", headers: { cookie } });
  assert.equal(logout.status, 503);
  assert.match(logout.headers.get("set-cookie") ?? "", /Expires=Thu, 01 Jan 1970/);
  store.setOutage(false);
  assert.equal((await me()).status, 200);
  store.setUser({ isActive: false });
  assert.equal((await me()).status, 401);
  for (const token of ["invalid", "", jwt.sign({ sub: "test-user" }, env.JWT_SECRET, { expiresIn: -1 })]) {
    const response = await fetch(`${origin}/api/auth/me`, { headers: { cookie: `${env.COOKIE_NAME}=${token}` } });
    assert.equal(response.status, 401);
    assert.equal(((await response.json()) as { error: { code: string } }).error.code, "UNAUTHENTICATED");
  }
  store.setUser({ isActive: true });
  const success = await fetch(`${origin}/api/auth/logout`, { method: "POST", headers: { cookie } });
  assert.equal(success.status, 200);
  assert.equal((await me()).status, 401);
});

test("missing session schema returns 503 for legacy and opaque credentials without clearing cookies", async (t) => {
  const { prisma } = await import("../lib/prisma");
  const { Prisma } = await import("../generated/prisma/client");
  const { signAccessToken } = await import("../lib/jwt");
  const { newSessionToken } = await import("../services/sessions.service");
  const originalFind = prisma.session.findUnique;
  const originalLegacy = env.ACCEPT_LEGACY_JWT;
  env.ACCEPT_LEGACY_JWT = "true";
  let code = "P2021";
  let lookups = 0;
  prisma.session.findUnique = (async () => {
    lookups += 1;
    throw new Prisma.PrismaClientKnownRequestError("Session schema is unavailable", {
      code, clientVersion: "test",
    });
  }) as unknown as typeof prisma.session.findUnique;
  t.after(() => { prisma.session.findUnique = originalFind; env.ACCEPT_LEGACY_JWT = originalLegacy; });
  const server = createApp().listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  t.after(() => new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve())));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  for (code of ["P2021", "P2022"]) {
    for (const token of [signAccessToken("legacy-schema-regression"), newSessionToken()]) {
      const response = await fetch(`${origin}/api/auth/me`, { headers: { cookie: `${env.COOKIE_NAME}=${token}` } });
      assert.equal(response.status, 503);
      assert.equal(((await response.json()) as { error: { code: string } }).error.code, "SERVICE_UNAVAILABLE");
      assert.equal(response.headers.get("set-cookie"), null);
    }
  }
  assert.equal(lookups, 4);
  const noCookie = await fetch(`${origin}/api/auth/me`);
  assert.equal(noCookie.status, 401);
  assert.equal(lookups, 4);
});

test("login reports schema and connectivity failures as 503 in both issuance modes", async (t) => {
  const store = sessionStore(t);
  const { prisma } = await import("../lib/prisma");
  const { Prisma } = await import("../generated/prisma/client");
  const { hashPassword } = await import("../lib/password");
  const password = "Regression-login-password-123!";
  store.setUser({ passwordHash: await hashPassword(password) });
  const lookup = prisma.user.findUnique;
  const create = prisma.session.create;
  const server = createApp().listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  t.after(() => new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve())));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  for (const mode of ["legacy", "opaque"] as const) {
    env.SESSION_TOKEN_MODE = mode;
    for (const failure of ["missing-column", "missing-table", "connection"] as const) {
      let sessionCreates = 0;
      const error = new Prisma.PrismaClientKnownRequestError("Database unavailable to login", {
        code: failure === "missing-column" ? "P2022" : failure === "missing-table" ? "P2021" : "P1001",
        clientVersion: "test",
      });
      prisma.user.findUnique = failure === "missing-table" ? lookup :
        (async () => { throw error; }) as unknown as typeof prisma.user.findUnique;
      prisma.session.create = (async () => { sessionCreates += 1; throw error; }) as unknown as typeof prisma.session.create;
      const response = await fetch(`${origin}/api/auth/login`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: store.user.email, password }),
      });
      assert.equal(response.status, 503, `${mode}: ${failure}`);
      assert.equal(((await response.json()) as { error: { code: string } }).error.code, "SERVICE_UNAVAILABLE");
      assert.equal(response.headers.get("set-cookie"), null);
      assert.equal(sessionCreates, failure === "missing-table" ? 1 : 0);
      assert.equal(store.rows.size, 0);
      assert.equal(store.user.lastLoginAt, null);
    }
  }
  prisma.user.findUnique = lookup;
  prisma.session.create = create;
  const badPassword = await fetch(`${origin}/api/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: store.user.email, password: "incorrect-password" }),
  });
  assert.equal(badPassword.status, 401);
  const recovered = await fetch(`${origin}/api/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: store.user.email, password }),
  });
  assert.equal(recovered.status, 200);
  assert.ok(recovered.headers.has("set-cookie"));
  assert.equal(store.rows.size, 1);
});
