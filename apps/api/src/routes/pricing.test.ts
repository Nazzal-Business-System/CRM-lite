import assert from "node:assert/strict";
import test from "node:test";
import type { AddressInfo } from "node:net";
import { PERMISSION_KEYS, PRICING_CATALOG_VERSION } from "@nbs/shared";
import { createApp } from "../app";
import { env } from "../env";
import { prisma } from "../lib/prisma";
import { AppError } from "../lib/errors";
import { sessionStore } from "../test/session-store";
import { createLoginSession } from "../services/sessions.service";
import { pricingRates } from "../services/pricing-currency.service";
import { pricingService } from "../services/pricing.service";

test("pricing API enforces explicit permission for every role, tolerates zero markets, and preserves auth on outages", async (t) => {
  assert.equal(new URL(env.DATABASE_URL).hostname, "127.0.0.1");
  assert.equal(new URL(env.DATABASE_URL).port, "1");
  const store = sessionStore(t);
  const session = await createLoginSession(store.user.id, store.user.passwordHash);
  const cookie = `${env.COOKIE_NAME}=${session.token}`;
  const server = createApp().listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/pricing`;
  const input = { configurationVersion: 1, catalogVersion: PRICING_CATALOG_VERSION, product: "pos", modules: ["pos-core"], addons: [], customModuleTier: [], customSoftwareTier: null, customNotes: "" };
  const send = (path: string, authenticated = true, body: unknown = input) => fetch(base + path, { method: path.startsWith("/calculate") ? "POST" : "GET",
    headers: { ...(authenticated ? { cookie } : {}), "Content-Type": "application/json" }, body: path.startsWith("/calculate") ? JSON.stringify(body) : undefined });
  const assertNotCleared = (response: Response) => { const header = response.headers.get("set-cookie") ?? ""; assert.equal(header.includes("Max-Age=0") || header.includes("Expires=Thu, 01 Jan 1970"), false); };
  for (const [body, expected] of [["{broken", 400], [JSON.stringify({ notes: "x".repeat(2 * 1024 * 1024) }), 413]] as const) {
    const malformed = await fetch(base + "/calculate", { method: "POST", headers: { cookie, "Content-Type": "application/json" }, body });
    assert.equal(malformed.status, expected); assertNotCleared(malformed);
    assert.equal((await malformed.json() as { error: { code: string } }).error.code, "VALIDATION_ERROR");
  }
  for (const path of ["/catalog", "/prices", "/calculate", "/exchange-rates", "/calculate-converted"]) {
    assert.equal((await send(path, false)).status, 401);
    assert.equal((await send(path)).status, 403);
  }
  store.setUser({ role: { ...store.user.role, name: "Admin", isSystem: true } });
  assert.equal((await send("/calculate")).status, 403); // Role alone never authorizes pricing.
  const grantedRole = { ...store.user.role, name: "Sales", permissions: [{ roleId: "sales", permissionId: "pricing", permission: { id: "pricing", key: PERMISSION_KEYS.PRICING_VIEW, category: "Pricing", description: "fixture" } }] };
  store.setUser({ role: grantedRole });
  const membershipCalls: unknown[] = [];
  const original = prisma.userSalesMarket.findMany;
  Reflect.set(prisma.userSalesMarket, "findMany", async (...args: unknown[]) => { membershipCalls.push(args); return []; });
  t.after(() => { Reflect.set(prisma.userSalesMarket, "findMany", original); });
  const catalog = await send("/catalog"); assert.equal(catalog.status, 200); assert.equal(catalog.headers.get("cache-control"), "no-store");
  const catalogBody = await catalog.text(); assert.equal(/"(amount|quote|presetPrice|componentTotal)"/.test(catalogBody), false);
  const prices = await send("/prices"); assert.equal(prices.status, 200); assert.equal(prices.headers.get("cache-control"), "no-store");
  const priceBody = await prices.json() as { data: { currency: string; modules: Array<{ id: string; quote: { kind: string; amount: number } }> } };
  assert.equal(priceBody.data.currency, "JOD"); assert.equal(priceBody.data.modules.find(item => item.id === "pos-core")?.quote.amount, 650);
  const rateGet = pricingRates.get.bind(pricingRates);
  t.mock.method(pricingRates, "get", async (currency: "JOD" | "USD" | "GBP") => currency === "JOD" ? rateGet(currency) : ({ version: "fx-line-half-up-v1", base: "JOD", currency, rate: 1.25, source: "Frankfurter v2", sourceUrl: "https://frankfurter.dev/", effectiveDate: "2026-11-14", retrievedAt: "2026-11-14T12:00:00.000Z", expiresAt: "2026-11-14T18:00:00.000Z" }));
  assert.equal((await send("/exchange-rates?currency=GBP")).status, 200);
  const converted = await send("/calculate-converted", true, { configuration: input, currency: "GBP" }); assert.equal(converted.status, 200);
  const convertedBody = await converted.json() as { data: { currency: string; estimatedTotal: number; jod: { estimatedTotal: number } } }; assert.equal(convertedBody.data.currency, "GBP"); assert.equal(convertedBody.data.estimatedTotal, 812.5); assert.equal(convertedBody.data.jod.estimatedTotal, 650);
  assert.equal((await send("/prices?currency=GBP")).status, 200);
  assert.equal((await send("/prices?currency=EUR")).status, 400);
  assert.equal((await send("/calculate-converted", true, { configuration: input, currency: "USD", rate: 1 })).status, 400);
  const result = await send("/calculate"); assert.equal(result.status, 200);
  const body = await result.json() as { data: { currency: string; estimatedTotal: number; lineItems: Array<{ amount: number }> } };
  assert.equal(body.data.currency, "JOD"); assert.equal(body.data.estimatedTotal, 650);
  assert.equal(body.data.lineItems.reduce((sum, line) => sum + line.amount, 0), 650);
  assert.equal(membershipCalls.length, 0); // Standalone access is independent of markets and business records.
  store.setUser({ role: { ...grantedRole, name: "Admin" } });
  assert.equal((await send("/calculate")).status, 200);
  store.setUser({ role: { ...grantedRole, permissions: [] } });
  assert.equal((await send("/calculate")).status, 403);
  store.setUser({ role: grantedRole });
  for (const invalid of [{ ...input, claimedEstimate: 1 }, { ...input, modules: ["pos-core", "erp-core"] }, { ...input, catalogVersion: "old" }]) {
    const bad = await send("/calculate", true, invalid); assert.equal(bad.status, 400); assertNotCleared(bad);
    assert.equal((await bad.text()).includes('"lineItems"'), false);
  }
  const validRates = pricingRates.get;
  pricingRates.get = async () => { throw new AppError(503, "EXCHANGE_RATES_UNAVAILABLE", "fixture rate outage"); };
  for (const path of ["/exchange-rates?currency=GBP", "/prices?currency=GBP", "/calculate-converted"]) { const response = await send(path, true, { configuration: input, currency: "GBP" }); assert.equal(response.status, 503); assertNotCleared(response); }
  pricingRates.get = validRates;
  store.setOutage(true);
  for (const path of ["/catalog", "/prices", "/calculate"]) {
    const unavailable = await send(path); assert.equal(unavailable.status, 503); assert.equal(unavailable.headers.get("set-cookie"), null);
    assert.equal((await unavailable.json() as { error: { code: string } }).error.code, "SERVICE_UNAVAILABLE");
  }
  store.setOutage(false); assert.equal((await send("/calculate")).status, 200);
  const calculate = pricingService.calculate;
  t.after(() => { pricingService.calculate = calculate; });
  pricingService.calculate = () => { throw new AppError(503, "SERVICE_UNAVAILABLE", "Pricing temporarily unavailable."); };
  const failed = await send("/calculate"); assert.equal(failed.status, 503); assertNotCleared(failed);
  pricingService.calculate = () => { throw new Error("synthetic calculation failure"); };
  const broken = await send("/calculate"); assert.equal(broken.status, 500); assertNotCleared(broken);
  assert.equal((await broken.text()).includes("synthetic"), false);
  pricingService.calculate = calculate; assert.equal((await send("/calculate")).status, 200);
  store.setUser({ isActive: false }); assert.equal((await send("/calculate")).status, 401);
});
