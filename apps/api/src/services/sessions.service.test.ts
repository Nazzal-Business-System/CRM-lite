import assert from "node:assert/strict";
import test from "node:test";
import jwt from "jsonwebtoken";
await import("../load-env");
const { env } = await import("../env");
const { sessionStore } = await import("../test/session-store");
const sessions = await import("./sessions.service");
const { updateUser } = await import("./users.service");
const { signAccessToken } = await import("../lib/jwt");
const { createLoginSession, authenticateSession, revokeSessionToken, IDLE_MS, ABSOLUTE_MS, ACTIVITY_INTERVAL_MS, hashSessionToken } = sessions;

test("opaque tokens are unique, hashed, independent, and have bounded metadata", async (t) => {
  const store = sessionStore(t);
  const [first, second] = await Promise.all([
    createLoginSession(store.user.id, store.user.passwordHash, "x".repeat(400)),
    createLoginSession(store.user.id, store.user.passwordHash),
  ]);
  assert.match(first.token, /^nbs_s1_[A-Za-z0-9_-]{43}$/);
  assert.notEqual(first.token, second.token);
  assert.equal(first.session.tokenHash, hashSessionToken(first.token));
  assert.ok(!JSON.stringify([...store.rows.values()]).includes(first.token));
  assert.equal(first.session.userAgent?.length, 256);
  assert.equal(first.session.idleExpiresAt.getTime() - first.session.createdAt.getTime(), IDLE_MS);
  assert.equal(first.session.absoluteExpiresAt.getTime() - first.session.createdAt.getTime(), ABSOLUTE_MS);
  assert.ok(await authenticateSession(first.token));
  assert.ok(await authenticateSession(second.token));
  await revokeSessionToken(first.token);
  await revokeSessionToken(first.token);
  assert.equal(await authenticateSession(first.token), null);
  assert.ok(await authenticateSession(second.token));
  assert.equal(store.rows.size, 2);
});

test("activity is throttled, renews idle time, and never exceeds 30 days", async (t) => {
  const store = sessionStore(t);
  const { token, session } = await createLoginSession(store.user.id, store.user.passwordHash);
  const at = (offset: number) => new Date(session.createdAt.getTime() + offset);
  await authenticateSession(token, undefined, at(ACTIVITY_INTERVAL_MS - 1));
  assert.equal(store.writes, 0);
  const renewed = await authenticateSession(token, undefined, at(ACTIVITY_INTERVAL_MS));
  assert.equal(store.writes, 1);
  assert.equal(renewed?.idleExpiresAt.getTime(), at(ACTIVITY_INTERVAL_MS + IDLE_MS).getTime());
  for (const day of [6, 12, 18, 24, 29]) assert.ok(await authenticateSession(token, undefined, at(day * IDLE_MS / 7)));
  assert.equal(store.rows.get(hashSessionToken(token))?.idleExpiresAt.getTime(), session.absoluteExpiresAt.getTime());
  assert.equal(await authenticateSession(token, undefined, at(ABSOLUTE_MS)), null);
});

test("expired and unknown sessions fail closed without renewal", async (t) => {
  const store = sessionStore(t);
  const { token, session } = await createLoginSession(store.user.id, store.user.passwordHash);
  assert.equal(await authenticateSession(token, undefined, session.idleExpiresAt), null);
  assert.equal(store.writes, 0);
  assert.equal(await authenticateSession(sessions.newSessionToken()), null);
  assert.equal(await authenticateSession("malformed"), null);
  store.setOutage(true);
  assert.equal(await authenticateSession("malformed"), null);
});

test("lookup and renewal outages reject as infrastructure errors, then recover", async (t) => {
  const store = sessionStore(t);
  const { token, session } = await createLoginSession(store.user.id, store.user.passwordHash);
  store.setOutage(true);
  await assert.rejects(authenticateSession(token), /unavailable/);
  await assert.rejects(revokeSessionToken(token), /unavailable/);
  store.setOutage(false); store.setTouchOutage(true);
  await assert.rejects(authenticateSession(token, undefined, new Date(session.createdAt.getTime() + ACTIVITY_INTERVAL_MS)), /write failed/);
  store.setTouchOutage(false);
  assert.ok(await authenticateSession(token));
});

test("password changes and deactivation revoke every session and block JWT re-adoption", async (t) => {
  const store = sessionStore(t);
  const legacy = jwt.sign({ sub: store.user.id, iat: Math.floor(Date.now() / 1000) - 60 }, env.JWT_SECRET, { expiresIn: "7d" });
  const a = await createLoginSession(store.user.id, store.user.passwordHash);
  const b = await createLoginSession(store.user.id, store.user.passwordHash);
  await updateUser(store.user.id, { password: "Replacement-password-123!" }, store.user.id);
  assert.equal(store.user.sessionVersion, 1);
  assert.equal(await authenticateSession(a.token), null);
  assert.equal(await authenticateSession(b.token), null);
  assert.equal(await authenticateSession(legacy), null);
  assert.ok([...store.rows.values()].every((row) => row.revocationReason === "PASSWORD_CHANGED"));
  await assert.rejects(createLoginSession(store.user.id, "verified-hash"));
  const fresh = await createLoginSession(store.user.id, store.user.passwordHash);
  await updateUser(store.user.id, { isActive: false }, store.user.id);
  assert.equal(await authenticateSession(fresh.token), null);
  await updateUser(store.user.id, { isActive: true }, store.user.id);
  assert.equal(await authenticateSession(fresh.token), null);
  assert.equal(await authenticateSession(legacy), null);
});

test("security changes roll back if durable revocation fails", async (t) => {
  const store = sessionStore(t);
  await createLoginSession(store.user.id, store.user.passwordHash);
  store.setTouchOutage(true);
  await assert.rejects(updateUser(store.user.id, { isActive: false }, store.user.id));
  assert.equal(store.user.isActive, true);
  assert.equal(store.user.sessionVersion, 0);
});

test("legacy adoption is idempotent, retains signed expiry, and cannot resurrect logout", async (t) => {
  const store = sessionStore(t);
  const token = signAccessToken(store.user.id);
  const first = await authenticateSession(token);
  assert.ok(first?.isLegacy);
  assert.equal((await authenticateSession(token))?.id, first.id);
  assert.equal(store.rows.size, 1);
  const renewed = await authenticateSession(token, undefined, new Date(Date.now() + ACTIVITY_INTERVAL_MS));
  assert.equal(renewed?.idleExpiresAt.getTime(), first.idleExpiresAt.getTime());
  await revokeSessionToken(token);
  assert.equal(await authenticateSession(token), null);
  const neverAdopted = signAccessToken(store.user.id);
  await revokeSessionToken(neverAdopted);
  assert.equal(await authenticateSession(neverAdopted), null);
  env.ACCEPT_LEGACY_JWT = "false";
  assert.equal(await authenticateSession(signAccessToken(store.user.id)), null);
});

test("compatibility issuance remains readable as JWT until the opaque rollout switch", async (t) => {
  const store = sessionStore(t);
  env.SESSION_TOKEN_MODE = "legacy";
  const a = await createLoginSession(store.user.id, store.user.passwordHash);
  const b = await createLoginSession(store.user.id, store.user.passwordHash);
  assert.equal(jwt.verify(a.token, env.JWT_SECRET).sub, store.user.id);
  assert.notEqual(a.token, b.token);
  assert.ok(a.session.isLegacy);
  assert.ok(await authenticateSession(a.token));
});

test("password login issues an opaque cookie credential and rejects bad passwords", async (t) => {
  const store = sessionStore(t);
  const { hashPassword } = await import("../lib/password");
  const { loginWithPassword } = await import("./auth.service");
  store.setUser({ passwordHash: await hashPassword("Login-password-123!") });
  await assert.rejects(loginWithPassword(store.user.email, "wrong"), (error: unknown) =>
    typeof error === "object" && error !== null && "status" in error && error.status === 401);
  assert.equal(store.rows.size, 0);
  const login = await loginWithPassword(store.user.email, "Login-password-123!", "agent");
  assert.match(login.token, /^nbs_s1_/);
  assert.equal(login.user.id, store.user.id);
  assert.equal(login.expiresAt.getTime(), store.rows.get(hashSessionToken(login.token))?.idleExpiresAt.getTime());
});

test("a revocation racing an activity write cannot be renewed or resurrected", async (t) => {
  const store = sessionStore(t);
  const { token, session } = await createLoginSession(store.user.id, store.user.passwordHash);
  store.beforeTouch(() => {
    store.rows.set(session.tokenHash, { ...session, revokedAt: new Date(), revocationReason: "LOGOUT" });
  });
  assert.equal(await authenticateSession(token, undefined, new Date(session.createdAt.getTime() + ACTIVITY_INTERVAL_MS)), null);
  assert.ok(store.rows.get(session.tokenHash)?.revokedAt);
});

test("a competing renewal is reread rather than overwritten with an older deadline", async (t) => {
  const store = sessionStore(t);
  const { token, session } = await createLoginSession(store.user.id, store.user.passwordHash);
  const newer = new Date(session.createdAt.getTime() + 2 * ACTIVITY_INTERVAL_MS);
  store.beforeTouch(() => {
    store.rows.set(session.tokenHash, { ...session, lastActivityAt: newer, idleExpiresAt: sessions.idleExpiry(newer, session.absoluteExpiresAt) });
  });
  const result = await authenticateSession(token, undefined, new Date(session.createdAt.getTime() + ACTIVITY_INTERVAL_MS));
  assert.equal(result?.lastActivityAt.getTime(), newer.getTime());
  assert.equal(result?.idleExpiresAt.getTime(), newer.getTime() + IDLE_MS);
});
