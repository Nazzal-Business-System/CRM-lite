import assert from "node:assert/strict";
import test from "node:test";
import type { AddressInfo } from "node:net";
import express from "express";
import cookieParser from "cookie-parser";
import { PERMISSION_KEYS as P, PRICING_CATALOG_VERSION } from "@nbs/shared";
import { pricingRouter, pricingBodyError } from "./pricing";
import { authRouter } from "./auth";
import { companiesRouter } from "./companies";
import { env } from "../env";
import { prisma } from "../lib/prisma";
import { marketRequestContext } from "../lib/market-context";
import { errorHandler, notFoundHandler } from "../middleware/error-handler";
import { installMarketStore } from "../test/market-store";
import { hashSessionToken, newSessionToken, IDLE_MS, ABSOLUTE_MS } from "../services/sessions.service";

test("saved-estimate HTTP authorization, copy semantics and outage recovery use real authentication with fixtures", async t => {
  assert.equal(new URL(env.DATABASE_URL).hostname, "127.0.0.1"); assert.equal(new URL(env.DATABASE_URL).port, "1");
  env.MARKET_ACCESS_MODE = "enforced";
  const f = installMarketStore(t); const now = new Date();
  const users = new Map(["partner", "uk", "unassigned", "admin"].map(id => [id, {
    id, name: id, email: `${id}@fixture.invalid`, isActive: true, sessionVersion: 0, lastLoginAt: now, createdAt: now, updatedAt: now,
    role: { id, name: id === "admin" ? "Admin" : "Sales", isSystem: true, description: null,
      permissions: [P.PRICING_VIEW, P.PRICING_ESTIMATES_CREATE, P.COMPANIES_VIEW, P.COMPANIES_DELETE].map((key: string) => ({ permission: { key } })) },
  }]));
  const cookies = new Map<string, string>(); const sessions = new Map<string, object>();
  for (const [id, user] of users) {
    const token = newSessionToken(); cookies.set(id, `${env.COOKIE_NAME}=${token}`);
    sessions.set(hashSessionToken(token), { id: `session-${id}`, userId: id, user, sessionVersion: 0, isLegacy: false, revokedAt: null, lastActivityAt: now,
      idleExpiresAt: new Date(now.getTime() + IDLE_MS), absoluteExpiresAt: new Date(now.getTime() + ABSOLUTE_MS) });
  }
  const sessionBefore = structuredClone([...sessions.values()]);
  const originalFind = prisma.session.findUnique;
  Reflect.set(prisma.session, "findUnique", async (args: { where: { tokenHash: string } }) => sessions.get(args.where.tokenHash) ?? null);
  t.after(() => { Reflect.set(prisma.session, "findUnique", originalFind); });
  const app = express(); app.use(express.json(), cookieParser(), marketRequestContext);
  app.use("/api/pricing", pricingBodyError, pricingRouter); app.use("/api/auth", authRouter); app.use("/api/companies", companiesRouter); app.use(notFoundHandler, errorHandler);
  const server = app.listen(0, "127.0.0.1"); await new Promise<void>(resolve => server.once("listening", resolve));
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  const input = { title: "Fixture", notes: "", companyId: null as string | null, configuration: { configurationVersion: 1, catalogVersion: PRICING_CATALOG_VERSION, product: "pos", modules: ["pos-core"], addons: [], customModuleTier: [], customSoftwareTier: null, customNotes: "" } };
  const send = async (id: string, path: string, method = "GET", body?: unknown) => {
    const response = await fetch(base + path, { method, headers: { ...(cookies.has(id) ? { cookie: cookies.get(id)! } : {}), "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    const json = await response.json() as { data: { estimate: { id: string; createdById: string; result: { estimatedTotal: number } }; items: unknown[]; total: number }; error: { code: string } };
    return { response, json };
  };
  assert.equal((await send("none", "/pricing/estimates")).response.status, 401);
  const own = await send("partner", "/pricing/estimates", "POST", input); assert.equal(own.response.status, 201);
  const id = own.json.data.estimate.id; assert.equal(own.json.data.estimate.result.estimatedTotal, 650);
  assert.equal((await send("uk", `/pricing/estimates/${id}`)).response.status, 404);
  assert.equal((await send("uk", "/pricing/estimates")).json.data.total, 0);
  assert.equal((await send("unassigned", "/pricing/estimates", "POST", input)).response.status, 201);
  assert.equal((await send("partner", "/pricing/estimates", "POST", { ...input, companyId: "c1" })).response.status, 404);
  const linked = await send("partner", "/pricing/estimates", "POST", { ...input, companyId: "c0" }); assert.equal(linked.response.status, 201);
  const memberships = structuredClone(f.tables.userSalesMarket!);
  f.tables.userSalesMarket = f.tables.userSalesMarket!.filter(row => !(row.userId === "partner" && row.marketCode === "JO"));
  assert.equal((await send("partner", `/pricing/estimates/${linked.json.data.estimate.id}`)).response.status, 404);
  assert.equal((await send("partner", "/pricing/estimates?companyId=c0")).json.data.total, 0);
  assert.equal((await send("partner", "/auth/me")).response.status, 200);
  f.tables.userSalesMarket = memberships;
  assert.equal((await send("partner", "/pricing/estimates", "POST", { ...input, result: { estimatedTotal: 1 } })).response.status, 400);
  const copy = await send("partner", `/pricing/estimates/${id}/copies`, "POST", { ...input, title: "New copy" }); assert.equal(copy.response.status, 201);
  assert.notEqual(copy.json.data.estimate.id, id);
  for (const method of ["PATCH", "PUT"]) assert.equal((await send("partner", `/pricing/estimates/${id}`, method, {})).response.status, 404);
  const admin = users.get("admin")!; const adminPermissions = admin.role.permissions;
  admin.role.permissions = [{ permission: { key: P.PRICING_ESTIMATES_VIEW_ALL } }];
  assert.equal((await send("admin", "/pricing/estimates")).response.status, 403);
  admin.role.permissions = [...adminPermissions, { permission: { key: P.PRICING_ESTIMATES_VIEW_ALL } }];
  assert.equal((await send("admin", `/pricing/estimates/${id}`)).response.status, 200);
  admin.role.permissions = adminPermissions;
  f.tables.company!.push({ ...f.tables.company![0], id: "estimate-only-company", name: "Fixture Company", nameNormalized: "fixture company" });
  assert.equal((await send("partner", "/pricing/estimates", "POST", { ...input, companyId: "estimate-only-company" })).response.status, 201);
  const blockedDelete = await send("admin", "/companies/estimate-only-company", "DELETE");
  assert.equal(blockedDelete.response.status, 409); assert.equal(blockedDelete.json.error.code, "CONFLICT");
  const beforeOutage = structuredClone(f.tables.pricingEstimate);
  f.setOutage(true);
  for (const [path, method, body] of [["/pricing/estimates", "GET", undefined], ["/pricing/estimates", "POST", input], [`/pricing/estimates/${id}`, "GET", undefined]] as const) {
    const failed = await send("partner", path, method, body); assert.equal(failed.response.status, 503); assert.equal(failed.json.error.code, "SERVICE_UNAVAILABLE");
    assert.equal((failed.response.headers.get("set-cookie") ?? "").includes("Max-Age=0"), false);
  }
  f.setOutage(false); assert.deepEqual(f.tables.pricingEstimate, beforeOutage);
  assert.equal((await send("partner", `/pricing/estimates/${id}`)).response.status, 200);
  assert.equal((await send("partner", "/auth/me")).response.status, 200);
  assert.deepEqual([...sessions.values()], sessionBefore);
});
