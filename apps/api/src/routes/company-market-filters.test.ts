import assert from "node:assert/strict";
import test from "node:test";
import type { AddressInfo } from "node:net";
import express from "express";
import { companyListQuerySchema, PERMISSION_KEYS, type AuthUser } from "@nbs/shared";
import { marketRequestContext } from "../lib/market-context";
import { env } from "../env";
import { companiesRouter } from "./companies";
import { marketMembershipsRouter } from "./market-memberships";
import { errorHandler } from "../middleware/error-handler";
import { installMarketStore } from "../test/market-store";

test("country/market filters validate, compose with owner/search/sort and cannot expand market visibility", async (t) => {
  env.MARKET_ACCESS_MODE = "enforced";
  const f = installMarketStore(t);
  f.tables.company![0]!.countryCode = "GB"; // Country and operational market deliberately differ.
  let identity = { id: "admin", role: { id: "admin-role", name: "Admin", isSystem: true }, permissions: [PERMISSION_KEYS.COMPANIES_VIEW, PERMISSION_KEYS.MARKETS_MANAGE_MEMBERSHIPS] } as AuthUser;
  const app = express(); app.use(express.json(), marketRequestContext);
  app.use((req, _res, next) => { req.authUser = identity; next(); });
  app.use("/companies", companiesRouter); app.use("/admin", marketMembershipsRouter); app.use(errorHandler);
  const server = app.listen(0, "127.0.0.1"); await new Promise<void>((resolve) => server.once("listening", resolve));
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const get = async (query: string) => { const response = await fetch(origin + "/companies" + query); return { response, body: await response.json() as { data: { items: Array<{ id: string }>; total: number; page: number } } }; };
  const matched = await get("?countryCode=gb&salesMarketCode=jo&ownerId=partner&search=Company&sort=name&order=asc&page=1&pageSize=1");
  assert.equal(matched.response.status, 200); assert.equal(matched.body.data.total, 1); assert.equal(matched.body.data.items[0]?.id, "c0");
  const page = await get("?countryCode=GB&sort=name&order=asc&page=2&pageSize=1");
  assert.equal(page.body.data.total, 2); assert.equal(page.body.data.items.length, 1);
  assert.equal((await get("?countryCode=UK")).response.status, 400);
  assert.equal((await get("?countryCode=XX")).response.status, 400);
  assert.equal((await get("?salesMarketCode=invalid%20market")).response.status, 400);
  identity = { ...identity, permissions: [PERMISSION_KEYS.MARKETS_MANAGE_MEMBERSHIPS] };
  assert.equal((await fetch(origin + "/admin/sales-markets")).status, 200);
  assert.equal((await fetch(origin + "/companies/sales-markets")).status, 403);
  identity = { ...identity, permissions: [PERMISSION_KEYS.COMPANIES_VIEW, PERMISSION_KEYS.MARKETS_MANAGE_MEMBERSHIPS] };
  identity = { ...identity, id: "partner", role: { ...identity.role, name: "Sales" } };
  const hidden = await get("?countryCode=GB&salesMarketCode=UK");
  assert.equal(hidden.response.status, 200); assert.equal(hidden.body.data.total, 0);
  assert.equal((await fetch(origin + "/admin/sales-markets")).status, 403);
  identity = { ...identity, role: { ...identity.role, name: "Admin", isSystem: false } };
  assert.equal((await fetch(origin + "/admin/sales-markets")).status, 403);
  const parsed = companyListQuerySchema.parse({ countryCode: " jo ", salesMarketCode: " uk " });
  assert.equal(parsed.countryCode, "JO"); assert.equal(parsed.salesMarketCode, "UK");
  assert.equal(f.tables.company!.length, 4); // Entire API test is read-only on isolated fixtures.
});
