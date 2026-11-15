// Pinned-child runtime check. Only disposable verification sessions are written/revoked.
import assert from "node:assert/strict";
import pg from "pg";
import type { AuthUser } from "@nbs/shared";
import { verifyChild } from "./isolated-dev-guard";
import { prisma } from "../src/lib/prisma";
import { env } from "../src/env";
import { newSessionToken, hashSessionToken, IDLE_MS, ABSOLUTE_MS } from "../src/services/sessions.service";
import { liveDemos } from "../src/config/demos";
import { visibleNavSections } from "../../web/src/lib/navigation";
const sessionIds: string[] = [];
const assertNoDestinations = (body: string) => { for (const item of [...liveDemos.demos, ...liveDemos.resources]) assert.ok(!body.includes(new URL(item.url).hostname)); };
async function target() { await verifyChild(env.DATABASE_URL); await verifyChild(process.env.DIRECT_URL!); }
async function inspect() {
  await target();
  const client = new pg.Client({ connectionString: process.env.DIRECT_URL, options: "-c default_transaction_read_only=on", connectionTimeoutMillis: 15000 });
  try {
    await client.connect();
    const counts = (await client.query("SELECT (SELECT count(*)::int FROM companies) AS companies,(SELECT count(*)::int FROM users) AS users,(SELECT count(*)::int FROM pricing_estimates) AS estimates")).rows[0];
    const grants = (await client.query('SELECT r.name,r."isSystem" FROM role_permissions rp JOIN permissions p ON p.id=rp."permissionId" JOIN roles r ON r.id=rp."roleId" WHERE p.key=\'demos.view\'')).rows;
    assert.equal(grants.length, 1); assert.equal(grants[0].name, "Admin"); assert.equal(grants[0].isSystem, true);
    return counts;
  } finally { await client.end(); }
}
async function issue(user: { id: string; sessionVersion: number }) {
  await target(); const token = newSessionToken(); const now = new Date();
  const session = await prisma.session.create({ data: { tokenHash: hashSessionToken(token), userId: user.id, sessionVersion: user.sessionVersion, isLegacy: false, lastActivityAt: now,
    idleExpiresAt: new Date(now.getTime() + IDLE_MS), absoluteExpiresAt: new Date(now.getTime() + ABSOLUTE_MS), userAgent: "Disposable Live Demos verification" } });
  sessionIds.push(session.id); return token;
}
async function request(origin: string, path: string, token?: string) {
  const response = await fetch(origin + path, { redirect: "manual", headers: token ? { Cookie: `${env.COOKIE_NAME}=${token}` } : {}, signal: AbortSignal.timeout(30000) });
  console.log(JSON.stringify({ origin, path, authenticated: !!token, status: response.status })); return response;
}
try {
  assert.equal(env.PORT, 4000); assert.equal(env.COOKIE_NAME, "nbs_crm_dev_session"); assert.equal(env.SESSION_TOKEN_MODE, "opaque"); assert.equal(env.MARKET_ACCESS_MODE, "enforced");
  const baseline = await inspect();
  const admin = await prisma.user.findFirst({ where: { isActive: true, role: { name: "Admin", isSystem: true, permissions: { some: { permission: { key: "demos.view" } } } } }, select: { id: true, sessionVersion: true } });
  const restricted = await prisma.user.findFirst({ where: { isActive: true, NOT: { role: { permissions: { some: { permission: { key: "demos.view" } } } } } }, select: { id: true, sessionVersion: true } });
  assert.ok(admin); assert.ok(restricted); const adminToken = await issue(admin); const restrictedToken = await issue(restricted);
  for (const origin of ["http://127.0.0.1:4000", "http://localhost:3000"]) {
    const me = await request(origin, "/api/auth/me", adminToken); assert.equal(me.status, 200);
    const user = (await me.json() as { data: { user: AuthUser } }).data.user; assert.ok(user.permissions.includes("demos.view"));
    assert.ok(visibleNavSections(user.permissions).flatMap(section => section.items).some(item => item.href === "/demos"));
    const allowed = await request(origin, "/api/demos", adminToken); assert.equal(allowed.status, 200); assert.equal(allowed.headers.get("cache-control"), "no-store"); assert.deepEqual(await allowed.json(), { data: liveDemos });
    const denied = await request(origin, "/api/demos", restrictedToken); assert.equal(denied.status, 403); assertNoDestinations(await denied.text());
    const anonymous = await request(origin, "/api/demos"); assert.equal(anonymous.status, 401); assertNoDestinations(await anonymous.text());
  }
  const page = await request("http://localhost:3000", "/demos", adminToken); assert.equal(page.status, 200); assert.match(page.headers.get("content-type") ?? "", /text\/html/); await page.text();
  assert.deepEqual(await inspect(), baseline);
  console.log(JSON.stringify({ result: "Live Admin demo access and refreshed sidebar permissions verified", grantedRoles: "system Admin only", ...baseline }));
} catch {
  console.error("Live Demos verification failed. Review status-only results above; credentials suppressed."); process.exitCode = 1;
} finally {
  try { if (sessionIds.length) { await target(); const result = await prisma.session.updateMany({ where: { id: { in: sessionIds }, revokedAt: null }, data: { revokedAt: new Date(), revocationReason: "LOGOUT" } }); assert.equal(result.count, sessionIds.length); console.log(JSON.stringify({ disposableSessionsRevoked: result.count })); } }
  finally { await prisma.$disconnect(); }
}
