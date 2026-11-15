import assert from "node:assert/strict";
import type { AuthUser } from "@nbs/shared";
import { verifyChild } from "./isolated-dev-guard";
import { prisma } from "../src/lib/prisma";
import { env } from "../src/env";
import { newSessionToken, hashSessionToken, IDLE_MS, ABSOLUTE_MS } from "../src/services/sessions.service";
import { visibleNavSections } from "../../web/src/lib/navigation";
const profiles = [
  { id: "cmt4z6zfq000xxcx4r04xj809", name: "Ahmad Nazzal", market: "OTHER", currency: "USD", accountType: "INTERNAL" },
  { id: "cmv30km8f00011seontkarqbd", name: "Mahmoud Al-Haj", market: "JO", currency: "JOD", accountType: "PARTNER" },
] as const;
const sessions: string[] = [];
async function target() { await verifyChild(env.DATABASE_URL); await verifyChild(process.env.DIRECT_URL!); }
async function request(path: string, token: string, origin = "http://127.0.0.1:4000", body?: unknown) {
  const response = await fetch(origin + path, { method: body ? "POST" : "GET", redirect: "manual", headers: { Cookie: `${env.COOKIE_NAME}=${token}`, ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000) });
  console.log(JSON.stringify({ path, origin, status: response.status })); return response;
}
async function issue(id: string) {
  await target(); const user = await prisma.user.findUnique({ where: { id }, select: { id: true, sessionVersion: true } }); assert.ok(user);
  const token = newSessionToken(); const now = new Date(); await target();
  const session = await prisma.session.create({ data: { tokenHash: hashSessionToken(token), userId: user.id, sessionVersion: user.sessionVersion, isLegacy: false, lastActivityAt: now, idleExpiresAt: new Date(now.getTime() + IDLE_MS), absoluteExpiresAt: new Date(now.getTime() + ABSOLUTE_MS), userAgent: "Disposable Phase 04A verification" } });
  sessions.push(session.id); return token;
}
try {
  assert.equal(env.PORT, 4000); assert.equal(env.COOKIE_NAME, "nbs_crm_dev_session"); assert.equal(env.MARKET_ACCESS_MODE, "enforced"); assert.equal(env.SESSION_TOKEN_MODE, "opaque");
  await target(); const accountCount = await prisma.user.count(); const adminToken = await issue(profiles[0].id); const partnerToken = await issue(profiles[1].id);
  for (const origin of ["http://127.0.0.1:4000", "http://localhost:3000"]) {
    for (const [index, profile] of profiles.entries()) {
      const token = index === 0 ? adminToken : partnerToken;
      const me = await request("/api/auth/me", token, origin); assert.equal(me.status, 200); const user = (await me.json() as { data: { user: AuthUser } }).data.user;
      assert.equal(user.id, profile.id); assert.equal(user.name, profile.name); assert.equal(user.defaultMarketCode, profile.market); assert.equal(user.initialDisplayCurrency, profile.currency); assert.equal(user.accountType, profile.accountType); assert.deepEqual(user.marketCodes, [profile.market]);
      const companies = await request("/api/companies?pageSize=100", token, origin); assert.equal(companies.status, 200); const body = await companies.json() as { data: { total: number; items: Array<{ salesMarketCode: string }> } }; assert.equal(body.data.total, 74);
      if (index === 1) assert.ok(body.data.items.every(company => company.salesMarketCode === "JO"));
      if (index === 0) { assert.ok(user.role.isSystem && user.role.name === "Admin"); const nav = visibleNavSections(user.permissions).flatMap(section => section.items); assert.ok(nav.some(item => item.href === "/admin/users" && item.label === "Partners")); assert.ok(!nav.some(item => item.href === "/admin/recruitment")); }
      console.log(JSON.stringify({ verifiedAccount: profile.name, id: profile.id, markets: user.marketCodes, defaultMarket: user.defaultMarketCode, displayCurrency: user.initialDisplayCurrency }));
    }
    const users = await request("/api/users", adminToken, origin); assert.equal(users.status, 200); const list = await users.json() as { data: { users: AuthUser[] } }; assert.equal(list.data.users.length, accountCount);
    assert.equal((await request("/api/users", partnerToken, origin)).status, 403);
    assert.equal((await request("/api/recruitment", adminToken, origin)).status, 200);
    const pricesResponse=await request("/api/pricing/price-books/default/prices",adminToken,origin);assert.equal(pricesResponse.status,200);
    const prices=(await pricesResponse.json() as {data:{currency:string;priceBook:{id:string;version:string;structureVersion:string};products:Array<{id:string;quote:{amount:number}}>}}).data;
    const {id,version,structureVersion}=prices.priceBook;
    const price=await request("/api/pricing/price-books/calculate",adminToken,origin,{priceBook:{id,version,structureVersion},configuration:{configurationVersion:1,product:"erp",modules:["erp-core"],addons:[],customModuleTier:[],customSoftwareTier:null,customNotes:""}});assert.equal(price.status,200);
    const priced=await price.json() as {data:{currency:string;estimatedTotal:number}};assert.equal(priced.data.currency,prices.currency);assert.equal(priced.data.estimatedTotal,prices.products.find(product=>product.id==="erp")!.quote.amount);

  }
  const partners=await request("/admin/users",adminToken,"http://localhost:3000");assert.equal(partners.status,200);await partners.text();
  for (const [path,destination] of [["/admin/users/new","/admin/users?create=partner"],[`/admin/users/${profiles[1].id}`,`/admin/users?edit=${profiles[1].id}`]]) {
    const page=await request(path!,adminToken,"http://localhost:3000");
    if(page.status===307)assert.equal(new URL(page.headers.get("location")!,"http://localhost:3000").href,"http://localhost:3000"+destination);
    else {assert.equal(page.status,200);assert.ok((await page.text()).includes("NEXT_REDIRECT;replace;"+destination+";307;"));}
  }
  const recruitment = await request("/admin/recruitment", adminToken, "http://localhost:3000");
  // App Router may have begun streaming before the server component redirects.
  if (recruitment.status === 307) assert.equal(new URL(recruitment.headers.get("location")!, "http://localhost:3000").pathname, "/admin/users");
  else { assert.equal(recruitment.status, 200); assert.ok((await recruitment.text()).includes("NEXT_REDIRECT;replace;/admin/users;307;")); }
  console.log("Phase 04A localhost verification passed. Only disposable sessions were created; no real accounts or ownership changed by verification.");
} catch { console.error("Phase 04A runtime verification failed; review status-only output. Credentials suppressed."); process.exitCode = 1; }
finally { try { if (sessions.length) { await target(); const result = await prisma.session.updateMany({ where: { id: { in: sessions }, revokedAt: null }, data: { revokedAt: new Date(), revocationReason: "LOGOUT" } }); assert.equal(result.count, sessions.length); console.log(JSON.stringify({ disposableSessionsRevoked: result.count })); } } finally { await prisma.$disconnect(); } }
