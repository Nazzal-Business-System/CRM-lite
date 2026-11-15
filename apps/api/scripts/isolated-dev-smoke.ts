import assert from "node:assert/strict";
import { verifyChild } from "./isolated-dev-guard";
import { prisma } from "../src/lib/prisma";
import { env } from "../src/env";
import { newSessionToken, hashSessionToken, IDLE_MS, ABSOLUTE_MS } from "../src/services/sessions.service";
import { signAccessToken } from "../src/lib/jwt";

const tokens: string[] = [];
async function request(path: string, token?: string, method = "GET", origin = "http://127.0.0.1:4000", body?: unknown) {
  await verifyChild(env.DATABASE_URL);
  const response = await fetch(`${origin}/api${path}`, { method, headers: { ...(token ? { Cookie: `${env.COOKIE_NAME}=${token}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000) });
  const json = await response.json() as { data: { user: { permissions: string[] }; markets: Array<{ code: string }>; total: number; estimatedTotal: number; items: Array<{ countryCode: string; salesMarketCode: string }>; catalogVersion: string } };
  console.log(JSON.stringify({ path, method, origin, status: response.status }));
  return { response, json };
}
async function issueFixtureSession(user: { id: string; sessionVersion: number }) {
  await verifyChild(env.DATABASE_URL);
  const token = newSessionToken(); const now = new Date();
  const session = await prisma.session.create({ data: { tokenHash: hashSessionToken(token), userId: user.id, sessionVersion: user.sessionVersion,
    isLegacy: false, createdAt: now, lastActivityAt: now, idleExpiresAt: new Date(now.getTime() + IDLE_MS), absoluteExpiresAt: new Date(now.getTime() + ABSOLUTE_MS), userAgent: "Disposable unified CRM verification" } });
  tokens.push(token); return { token, session };
}
try {
  assert.equal(env.PORT, 4000); assert.equal(env.COOKIE_NAME, "nbs_crm_dev_session");
  assert.equal(env.SESSION_TOKEN_MODE, "opaque"); assert.equal(env.ACCEPT_LEGACY_JWT, "true"); assert.equal(env.MARKET_ACCESS_MODE, "enforced");
  await verifyChild(env.DATABASE_URL);
  const admin = await prisma.user.findFirst({ where: { isActive: true, role: { isSystem: true, name: "Admin" } }, select: { id: true, sessionVersion: true } });
  assert.ok(admin, "An existing active system Admin is required.");
  assert.equal((await request("/auth/me")).response.status, 401);
  await verifyChild(env.DATABASE_URL);
  const first = await issueFixtureSession(admin);
  assert.ok(first.token.startsWith("nbs_s1_")); assert.equal(first.session.isLegacy, false);
  assert.equal(first.session.idleExpiresAt.getTime() - first.session.createdAt.getTime(), IDLE_MS);
  assert.equal(first.session.absoluteExpiresAt.getTime() - first.session.createdAt.getTime(), ABSOLUTE_MS);
  const me = await request("/auth/me", first.token); assert.equal(me.response.status, 200);
  assert.ok(me.json.data.user.permissions.includes("markets.manage_memberships"));
  for (const path of ["/companies", "/companies?pageSize=100", "/companies?countryCode=JO&salesMarketCode=JO", "/companies?countryCode=GB&salesMarketCode=UK", "/companies/sales-markets", "/admin/sales-markets", "/contacts", "/opportunities"]) {
    const result = await request(path, first.token); assert.equal(result.response.status, 200);
    if (path === "/companies" || path === "/companies?countryCode=JO&salesMarketCode=JO") {
      assert.equal(result.json.data.total, 74);
      assert.ok(result.json.data.items.every(company => company.countryCode === "JO" && company.salesMarketCode === "JO"));
    }
    if (path === "/companies?countryCode=GB&salesMarketCode=UK") assert.equal(result.json.data.total, 0);
    if (path === "/companies?pageSize=100") assert.equal(result.json.data.items.length, 74);
    if (path === "/companies/sales-markets") assert.deepEqual(result.json.data.markets.map((m: { code: string }) => m.code).sort(), ["JO", "OTHER", "UK", "US"]);
  }
  const configuration = { configurationVersion: 1, catalogVersion: "nbs-jod-2026-11-08.1", product: "pos", modules: ["pos-core"], addons: [], customModuleTier: [], customSoftwareTier: null, customNotes: "" };
  for (const permission of ["pricing.view", "pricing.estimates.create", "pricing.estimates.view_all"]) assert.ok(me.json.data.user.permissions.includes(permission));
  assert.equal((await request("/pricing/catalog", first.token)).response.status, 200);
  const calculated = await request("/pricing/calculate", first.token, "POST", undefined, configuration);
  assert.equal(calculated.response.status, 200); assert.equal(calculated.json.data.estimatedTotal, 650);
  assert.equal((await request("/pricing/estimates", first.token)).response.status, 200);
  assert.equal((await request("/pricing/estimates/unknown-disposable-id", first.token)).response.status, 404);
  const invalidSave = { title: "Not saved", notes: "", companyId: null, configuration, result: { estimatedTotal: 1 } };
  assert.equal((await request("/pricing/estimates", first.token, "POST", undefined, invalidSave)).response.status, 400);
  for (const path of ["/pricing/catalog", "/pricing/estimates"]) assert.equal((await request(path)).response.status, 401);
  const restricted = await prisma.user.findFirst({ where: { isActive: true, NOT: { role: { permissions: { some: { permission: { key: "pricing.view" } } } } } }, select: { id: true, sessionVersion: true } });
  assert.ok(restricted, "An existing non-pricing user is needed for live permission denial verification.");
  const denied = await issueFixtureSession(restricted);
  for (const path of ["/pricing/catalog", "/pricing/estimates"]) assert.equal((await request(path, denied.token)).response.status, 403);
  assert.equal((await request("/pricing/calculate", denied.token, "POST", undefined, configuration)).response.status, 403);
  assert.equal((await request("/pricing/estimates", denied.token, "POST", undefined, { title: "Not saved", notes: "", companyId: null, configuration })).response.status, 403);
  await verifyChild(env.DATABASE_URL);
  const second = await issueFixtureSession(admin);
  assert.notEqual(first.session.id, second.session.id);
  assert.equal((await request("/auth/logout", first.token, "POST")).response.status, 200);
  assert.equal((await request("/auth/me", first.token)).response.status, 401);
  assert.equal((await request("/auth/me", second.token)).response.status, 200);
  const legacy = signAccessToken(admin.id); tokens.push(legacy);
  assert.equal((await request("/auth/me", legacy)).response.status, 200);
  for (const path of ["/auth/me", "/companies", "/companies/sales-markets", "/pricing/catalog", "/pricing/estimates"]) assert.equal((await request(path, second.token, "GET", "http://localhost:3000")).response.status, 200);
  console.log("Unified child-only smoke passed: ports 3000/4000, all 74 companies, filters, pricing RBAC, opaque/legacy sessions, 7/30 expiry, concurrency and logout. Only disposable session records were created/revoked; no users, estimates or business records were changed. Password login is covered by isolated regression tests.");
} finally {
  for (const token of tokens) await request("/auth/logout", token, "POST").catch(() => { process.exitCode = 1; });
  await prisma.$disconnect();
}
