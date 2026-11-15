import assert from "node:assert/strict";
import test from "node:test";
import { MutationObserver, QueryClient, QueryObserver } from "@tanstack/react-query";
import { PERMISSION_KEYS, type AuthUser, type SalesMarketRef } from "@nbs/shared";
import { canManageUserMarkets, companyMarketListRequest, countryName, marketCatalogOptions, marketErrorKey, marketMembershipMutationOptions, marketName, sameMarketSelection, userMarketsOptions } from "./market-management";
import { ApiError } from "./api";
import { enMessages } from "../i18n/messages/en";
import { arMessages } from "../i18n/messages/ar";
import { localeDirection, translate } from "../i18n/config";

const admin = { id: "admin", role: { id: "admin", name: "Admin", isSystem: true }, permissions: [PERMISSION_KEYS.MARKETS_MANAGE_MEMBERSHIPS] } as AuthUser;
const market: SalesMarketRef = { code: "GCC", name: "Gulf", nameAr: "الخليج" };

test("membership controls require both the system Admin role and explicit permission", () => {
  assert.equal(canManageUserMarkets(admin), true);
  assert.equal(canManageUserMarkets({ ...admin, permissions: [] }), false);
  assert.equal(canManageUserMarkets({ ...admin, role: { ...admin.role, isSystem: false } }), false);
  assert.equal(canManageUserMarkets({ ...admin, role: { ...admin.role, name: "Sales" } }), false);
  assert.equal(canManageUserMarkets(null), false);
});

test("unauthorized controls do not fetch or submit membership changes", async (t) => {
  const client = new QueryClient(); t.after(() => client.clear()); let calls = 0;
  t.mock.method(globalThis, "fetch", async () => { calls++; return Response.json({ data: {} }); });
  const restricted = { ...admin, permissions: [] };
  const observer = new QueryObserver(client, { ...userMarketsOptions(restricted.id, "person"), enabled: canManageUserMarkets(restricted) });
  const stop = observer.subscribe(() => {}); t.after(stop);
  await assert.rejects(new MutationObserver(client, marketMembershipMutationOptions(client, restricted, "person")).mutate(["JO"]), (e: unknown) => e instanceof ApiError && e.status === 403);
  assert.equal(calls, 0);
});

test("market replacement binds the user ID and submits only normalized market codes", async (t) => {
  const client = new QueryClient(); t.after(() => client.clear());
  const calls: Array<{ path: string; method: string; body: unknown }> = [];
  t.mock.method(globalThis, "fetch", async (path: string, init: RequestInit) => {
    calls.push({ path, method: init.method ?? "GET", body: JSON.parse(String(init.body)) });
    return Response.json({ data: { userId: "person/one", marketCodes: ["JO", "UK"] } });
  });
  client.setQueryData(["auth", "me"], admin);
  client.setQueryData(userMarketsOptions(admin.id, "person/one").queryKey, { memberships: [] });
  client.setQueryData(["audit-logs"], { items: [] });
  await new MutationObserver(client, marketMembershipMutationOptions(client, admin, "person/one")).mutate([" jo ", "uk"]);
  assert.deepEqual(calls, [{ path: "/api/admin/users/person%2Fone/markets", method: "PUT", body: { marketCodes: ["JO", "UK"] } }]);
  assert.equal(client.getQueryState(userMarketsOptions(admin.id, "person/one").queryKey)?.isInvalidated, true);
  assert.equal(client.getQueryState(["audit-logs"])?.isInvalidated, true);
  assert.deepEqual(client.getQueryData(["auth", "me"]), admin);
});

test("empty replacement is explicit and malformed selections never reach the API", async (t) => {
  const client = new QueryClient(); t.after(() => client.clear()); const bodies: unknown[] = [];
  t.mock.method(globalThis, "fetch", async (_path: string, init: RequestInit) => { bodies.push(JSON.parse(String(init.body))); return Response.json({ data: { userId: "person", marketCodes: [] } }); });
  const mutation = new MutationObserver(client, marketMembershipMutationOptions(client, admin, "person"));
  await assert.rejects(mutation.mutate(["JO", "jo"]));
  assert.equal(bodies.length, 0);
  await mutation.mutate([]); assert.deepEqual(bodies, [{ marketCodes: [] }]);
});

test("outages and permission denial preserve loaded memberships and authenticated identity; recovery refreshes", async (t) => {
  const client = new QueryClient(); t.after(() => client.clear());
  const key = userMarketsOptions(admin.id, "person").queryKey;
  const previous = { memberships: [{ marketCode: "JO" }] };
  client.setQueryData(key, previous); client.setQueryData(["auth", "me"], admin);
  let status = 503;
  t.mock.method(globalThis, "fetch", async () => status === 200 ? Response.json({ data: { userId: "person", marketCodes: ["US"] } }) : Response.json({ error: { code: status === 403 ? "FORBIDDEN" : "SERVICE_UNAVAILABLE", message: "fixture" } }, { status }));
  const mutation = new MutationObserver(client, marketMembershipMutationOptions(client, admin, "person"));
  for (const failure of [503, 403]) { status = failure; await assert.rejects(mutation.mutate(["US"])); assert.deepEqual(client.getQueryData(key), previous); assert.deepEqual(client.getQueryData(["auth", "me"]), admin); }
  status = 200; await mutation.mutate(["US"]);
  assert.equal(client.getQueryState(key)?.isInvalidated, true);
});

test("company requests preserve ownership, search, sort and pagination alongside independent country and market", () => {
  const filters = { search: "Acme & Co", priority: "HIGH", sort: "name:asc" as const, page: 3, ownerId: "owner/1", countryCode: "GB", salesMarketCode: "JO" };
  const request = companyMarketListRequest(filters, admin.id);
  const params = new URL(request.path, "http://fixture.invalid").searchParams;
  assert.equal(params.get("countryCode"), "GB"); assert.equal(params.get("salesMarketCode"), "JO");
  assert.equal(params.get("ownerId"), "owner/1"); assert.equal(params.get("search"), "Acme & Co");
  assert.equal(params.get("sort"), "name"); assert.equal(params.get("order"), "asc"); assert.equal(params.get("page"), "3"); assert.equal(params.get("pageSize"), "20");
  const empty = companyMarketListRequest({ ...filters, countryCode: "", salesMarketCode: "", ownerId: null });
  assert.equal(new URL(empty.path, "http://fixture.invalid").searchParams.has("countryCode"), false);
  assert.notDeepEqual(request.queryKey, companyMarketListRequest({ ...filters, countryCode: "US" }, admin.id).queryKey);
  assert.notDeepEqual(request.queryKey, companyMarketListRequest(filters, "another-viewer").queryKey);
});

test("reference labels localize configured future markets and never default legacy NULLs to Jordan", () => {
  assert.equal(marketName("GCC", [market], "ar", "empty"), "الخليج");
  assert.equal(marketName("GCC", [market], "en", "empty"), "Gulf");
  assert.equal(marketName("FUTURE", [], "en", "empty"), "FUTURE");
  assert.equal(marketName(null, [], "ar", "legacy"), "legacy");
  assert.equal(countryName(null, "en", "legacy"), "legacy");
  assert.equal(countryName("GB", "en", "legacy"), "United Kingdom");
  assert.notEqual(countryName("GB", "ar", "legacy"), "United Kingdom");
  assert.equal(sameMarketSelection(["JO", "UK"], ["UK", "JO"]), true);
  assert.equal(sameMarketSelection([], ["JO"]), false);
});

test("reference queries are viewer-specific and market management uses its own permission-protected catalog", () => {
  assert.notDeepEqual(marketCatalogOptions("a").queryKey, marketCatalogOptions("b").queryKey);
  assert.notDeepEqual(marketCatalogOptions("a").queryKey, marketCatalogOptions("a", true).queryKey);
  assert.notDeepEqual(userMarketsOptions("a", "one").queryKey, userMarketsOptions("a", "two").queryKey);
  assert.equal(marketErrorKey(new ApiError(403, "FORBIDDEN", "fixture")), "markets.denied");
  assert.equal(marketErrorKey(new ApiError(503, "SERVICE_UNAVAILABLE", "fixture")), "markets.unavailable");
});

test("English and Arabic market strings and interpolation variables stay in sync", () => {
  assert.deepEqual(Object.keys(enMessages.markets).sort(), Object.keys(arMessages.markets).sort());
  for (const [key, value] of Object.entries(enMessages.markets)) {
    const arabic = arMessages.markets[key as keyof typeof arMessages.markets];
    assert.ok(arabic.trim().length);
    assert.deepEqual(value.match(/\{[^}]+\}/g) ?? [], arabic.match(/\{[^}]+\}/g) ?? []);
  }
});

test("market messages resolve in EN/AR with the existing LTR/RTL locale contract", () => {
  assert.equal(localeDirection("en"), "ltr");
  assert.equal(localeDirection("ar"), "rtl");
  for (const [locale, messages] of [["en", enMessages], ["ar", arMessages]] as const) {
    for (const key of Object.keys(messages.markets)) {
      const path = `markets.${key}`;
      const value = translate(messages, path, { name: "Fixture Partner" });
      assert.notEqual(value, path); assert.ok(value.trim()); assert.equal(/\{[^}]+\}/.test(value), false);
    }
    assert.ok(translate(messages, "markets.confirmTitle", { name: "Fixture Partner" }).includes("Fixture Partner"));
    assert.notEqual(countryName("JO", locale, ""), "");
  }
});


test("management and company reference lookups call their distinct backend contracts", async (t) => {
  const paths: string[] = [];
  t.mock.method(globalThis, "fetch", async (path: string) => { paths.push(path); return Response.json({ data: { markets: [market] } }); });
  assert.equal((await marketCatalogOptions(admin.id, true).queryFn()).markets[0]?.code, "GCC");
  assert.equal((await marketCatalogOptions(admin.id).queryFn()).markets[0]?.code, "GCC");
  assert.deepEqual(paths, ["/api/admin/sales-markets", "/api/companies/sales-markets"]);
});
