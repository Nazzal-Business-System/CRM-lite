import assert from "node:assert/strict";
import test from "node:test";
import jwt from "jsonwebtoken";

await import("../load-env");

const { env } = await import("../env");
const { sessionCookieOptions, sessionCookieScope } = await import("./cookies");
const { expiryToMs, signAccessToken, verifyAccessToken } = await import("./jwt");

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

test("configured JWT and persistent cookie share the seven-day lifetime", () => {
  assert.equal(env.JWT_EXPIRES_IN, "7d");
  assert.equal(expiryToMs(env.JWT_EXPIRES_IN), SEVEN_DAYS_MS);
  assert.equal(sessionCookieOptions().maxAge, SEVEN_DAYS_MS);

  const token = signAccessToken("session-test-user");
  const decoded = jwt.decode(token);
  assert.equal(typeof decoded, "object");
  assert.ok(decoded && typeof decoded === "object" && decoded.iat && decoded.exp);
  assert.ok(Math.abs((decoded.exp - decoded.iat) * 1000 - SEVEN_DAYS_MS) < 1000);
  assert.equal(verifyAccessToken(token), "session-test-user");
});

test("session cookie scope is secure and deletion uses the same host/path scope", () => {
  const scope = sessionCookieScope();
  assert.equal(scope.httpOnly, true);
  assert.equal(scope.sameSite, "lax");
  assert.equal(scope.path, "/");
  assert.equal(scope.domain, undefined);
  assert.equal("maxAge" in scope, false);
  assert.equal(sessionCookieOptions().secure, env.cookieSecure);
});

test("invalid session durations fail closed", () => {
  assert.throws(() => expiryToMs("forever"), /Invalid JWT_EXPIRES_IN/);
});
