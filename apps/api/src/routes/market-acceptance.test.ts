import assert from "node:assert/strict";
import test from "node:test";
import type { AddressInfo } from "node:net";
import express from "express";
import cookieParser from "cookie-parser";
import ExcelJS from "exceljs";
import { PERMISSION_KEYS } from "@nbs/shared";
import { env } from "../env";
import { prisma } from "../lib/prisma";
import { marketRequestContext } from "../lib/market-context";
import { errorHandler } from "../middleware/error-handler";
import { authRouter } from "./auth";
import { companiesRouter } from "./companies";
import { contactsRouter } from "./contacts";
import { opportunitiesRouter } from "./opportunities";
import { dashboardRouter, importsRouter, researchRouter } from "./dashboard";
import { salesPerformanceRouter } from "./sales-performance";
import { marketMembershipsRouter } from "./market-memberships";
import { hashSessionToken, newSessionToken, IDLE_MS, ABSOLUTE_MS } from "../services/sessions.service";
import { installMarketStore } from "../test/market-store";

// Real HTTP routing/authentication/authorization, with only the database delegates replaced.
// Never imports load-env: the test command supplies an unreachable loopback DATABASE_URL.
test("Phase 02 acceptance through authenticated HTTP, without live records", async (t) => {
  assert.equal(new URL(env.DATABASE_URL).hostname, "127.0.0.1");
  assert.equal(new URL(env.DATABASE_URL).port, "1");
  env.MARKET_ACCESS_MODE = "enforced";
  const f = installMarketStore(t);
  f.tables.company!.push({ ...f.tables.company![0], id: "c4", name: "Other Fixture", nameNormalized: "other fixture", salesMarketCode: "OTHER", countryCode: "CA" });
  // Actual country must never grant operational territory access.
  f.tables.company![0]!.countryCode = "GB";
  const owners = () => structuredClone({ companies: f.tables.company!.map(r => [r.id, r.ownerId]), opportunities: f.tables.opportunity!.map(r => [r.id, r.ownerId, r.commissionRepresentativeId]), tasks: f.tables.task!.map(r => [r.id, r.ownerId]) });
  const originalOwners = owners();
  const permissions = Object.values(PERMISSION_KEYS).map(key => ({ permission: { key } }));
  const now = new Date();
  const tokens = new Map<string, string>();
  const sessions = new Map<string, Record<string, unknown>>();
  for (const id of ["admin", "partner", "unassigned"]) {
    const token = newSessionToken(); tokens.set(id, token);
    const user = { ...f.tables.user!.find(r => r.id === id), sessionVersion: 1, lastLoginAt: now, createdAt: now, updatedAt: now,
      role: { id: id === "admin" ? "admin-role" : "sales-role", name: id === "admin" ? "Admin" : "Sales", isSystem: true, description: null, permissions } };
    sessions.set(hashSessionToken(token), { id: `session-${id}`, userId: id, user, sessionVersion: 1, isLegacy: false, revokedAt: null,
      createdAt: now, lastActivityAt: now, idleExpiresAt: new Date(now.getTime() + IDLE_MS), absoluteExpiresAt: new Date(now.getTime() + ABSOLUTE_MS) });
  }
  const sessionBefore = structuredClone([...sessions.values()]);
  const originalFind = prisma.session.findUnique;
  Reflect.set(prisma.session, "findUnique", async (args: { where: { tokenHash: string } }) => sessions.get(args.where.tokenHash) ?? null);
  t.after(() => { Reflect.set(prisma.session, "findUnique", originalFind); });
  const app = express();
  app.use(express.json(), cookieParser(), marketRequestContext);
  app.use("/auth", authRouter); app.use("/admin", marketMembershipsRouter);
  app.use("/companies", companiesRouter); app.use("/contacts", contactsRouter); app.use("/opportunities", opportunitiesRouter);
  app.use("/imports", importsRouter); app.use("/dashboard", dashboardRouter); app.use("/research", researchRouter);
  app.use("/sales-performance", salesPerformanceRouter); app.use(errorHandler);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const send = async (actor: string, path: string, method = "GET", body?: unknown) => {
    const response = await fetch(base + path, { method, headers: { Cookie: `${env.COOKIE_NAME}=${tokens.get(actor) ?? "invalid"}`, ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const json = await response.json() as { data: Record<string, unknown>; error?: { code: string } };
    return { status: response.status, json, text: JSON.stringify(json) };
  };
  const ids = (data: unknown) => (data as Array<{ id: string }>).map(r => r.id).sort();
  const assign = async (codes: string[]) => assert.equal((await send("admin", "/admin/users/partner/markets", "PUT", { marketCodes: codes })).status, 200);
  const companies = async (actor: string, query = "") => {
    const result = await send(actor, "/companies" + query); assert.equal(result.status, 200); return ids(result.json.data.items);
  };

  await t.test("system Admin is global across four markets and legacy NULLs; assignment requires Admin", async () => {
    assert.deepEqual(await companies("admin"), ["c0", "c1", "c2", "c3", "c4"]);
    assert.equal((await send("admin", "/admin/sales-markets")).status, 200);
    assert.equal((await send("partner", "/admin/sales-markets")).status, 403);
    assert.equal((await send("partner", "/admin/users/partner/markets", "PUT", { marketCodes: ["UK"] })).status, 403);
    assert.equal((await send("admin", "/admin/users/partner/markets", "PUT", { marketCodes: ["BAD"] })).status, 400);
  });
  await t.test("Jordan-only access follows market rather than country and denies direct IDs", async () => {
    await assign(["JO"]);
    assert.deepEqual(await companies("partner"), ["c0"]);
    assert.deepEqual(await companies("partner", "?countryCode=GB&salesMarketCode=JO"), ["c0"]);
    assert.deepEqual(await companies("partner", "?salesMarketCode=UK"), []);
    for (const id of ["c1", "c2", "c3", "c4"]) assert.equal((await send("partner", `/companies/${id}`)).status, 404);
    assert.equal((await send("partner", "/companies/c0")).status, 200);
    assert.equal((await send("partner", "/companies/c1", "PATCH", { generalNotes: "blocked fixture write" })).status, 404);
  });
  await t.test("related contacts/opportunities, lookups, research and aggregates cannot leak hidden markets", async () => {
    assert.deepEqual(ids((await send("partner", "/contacts")).json.data.items), ["p0"]);
    assert.deepEqual(ids((await send("partner", "/opportunities")).json.data.items), ["o0"]);
    for (const path of ["/contacts/p1", "/contacts/p2", "/opportunities/o1", "/opportunities/o2"]) assert.equal((await send("partner", path)).status, 404);
    assert.equal((await send("partner", "/contacts/p1", "PATCH", { notes: "blocked" })).status, 404);
    assert.equal((await send("partner", "/opportunities/o1", "PATCH", { name: "blocked" })).status, 404);
    assert.equal((await send("partner", "/contacts/p0")).status, 200);
    assert.equal((await send("partner", "/opportunities/o0")).status, 200);
    assert.deepEqual((await send("partner", "/companies/options?search=Company%201")).json.data.companies, []);
    assert.deepEqual((await send("partner", "/contacts/options?companyId=c1")).json.data.contacts, []);
    const research = await send("partner", "/research?search=Company%201"); assert.equal(research.status, 200);
    assert.equal((research.json.data.evidence as { total: number }).total, 0);
    assert.equal((research.json.data.hypotheses as { total: number }).total, 0);
    const dashboard = await send("partner", "/dashboard"); assert.equal(dashboard.status, 200);
    assert.equal((dashboard.json.data.dashboard as { metrics: { totalCompanies: number } }).metrics.totalCompanies, 1);
    const report = await send("partner", "/sales-performance?period=custom&from=2026-11-01&to=2026-11-30"); assert.equal(report.status, 200);
    assert.equal((report.json.data.performance as { overall: { opportunitiesCreated: number } }).overall.opportunitiesCreated, 1);
  });
  await t.test("import preview/commit reject forged cross-market company and contact references", async () => {
    const form = new FormData(); form.set("entity", "COMPANIES");
    form.set("file", new Blob(["Company Name,Country Code,Sales Market\nSecret Fixture,GB,UK\nAllowed Fixture,JO,JO\n"]), "fixture.csv");
    const previewResponse = await fetch(base + "/imports/parse", { method: "POST", headers: { Cookie: `${env.COOKIE_NAME}=${tokens.get("partner")}` }, body: form });
    assert.equal(previewResponse.status, 200, await previewResponse.clone().text());
    const preview = await previewResponse.json() as { data: { preview: { rows: Array<{ status: string }> } } };
    assert.equal(preview.data.preview.rows[0]?.status, "INVALID"); assert.notEqual(preview.data.preview.rows[1]?.status, "INVALID");
    const before = structuredClone([f.tables.company, f.tables.contact]);
    for (const [entity, values] of [["COMPANIES", { "Company Name": "Forged", "Country Code": "GB", "Sales Market": "UK" }], ["CONTACTS", { "Company Name": "Company 1", Name: "Forged Contact" }]] as const) {
      const result = await send("partner", "/imports/commit", "POST", { entity, rows: [{ rowNumber: 1, included: true, values }] });
      assert.equal(result.status, 200); assert.equal((result.json.data.result as { created: number }).created, 0);
      assert.equal(result.text.includes('"Company 1"'), false);
    }
    assert.deepEqual([f.tables.company, f.tables.contact], before);
  });
  await t.test("multipart continuations preserve separate Admin and partner contexts concurrently", async () => {
    const parse = async (actor: string) => {
      const form = new FormData(); form.set("entity", "COMPANIES");
      form.set("file", new Blob(["Company Name,Country Code,Sales Market\nUK Upload Fixture,GB,UK\n"]), "fixture.csv");
      const response = await fetch(base + "/imports/parse", { method: "POST", headers: { Cookie: `${env.COOKIE_NAME}=${tokens.get(actor) ?? "invalid"}` }, body: form });
      return { status: response.status, body: await response.json() as { data: { preview: { rows: Array<{ status: string }> } } } };
    };
    const [admin, partner, anonymous] = await Promise.all([parse("admin"), parse("partner"), parse("anonymous")]);
    assert.equal(admin.status, 200); assert.notEqual(admin.body.data.preview.rows[0]?.status, "INVALID");
    assert.equal(partner.status, 200); assert.equal(partner.body.data.preview.rows[0]?.status, "INVALID");
    assert.equal(anonymous.status, 401);
  });
  await t.test("multiple markets expand only to assigned markets and zero markets return no business data", async () => {
    await assign(["JO", "US"]); assert.deepEqual(await companies("partner"), ["c0", "c2"]);
    assert.equal((await send("partner", "/companies/c2")).status, 200);
    assert.equal((await send("partner", "/companies/c1")).status, 404);
    for (const actor of ["partner", "unassigned"]) {
      if (actor === "partner") await assign([]);
      assert.deepEqual(await companies(actor), []);
      for (const path of ["/contacts", "/opportunities"]) assert.deepEqual((await send(actor, path)).json.data.items, []);
      for (const path of ["/companies/c0", "/contacts/p0", "/opportunities/o0"]) assert.equal((await send(actor, path)).status, 404);
      const dashboard = (await send(actor, "/dashboard")).json.data.dashboard as { metrics: { totalCompanies: number; activeOpportunities: number } };
      assert.equal(dashboard.metrics.totalCompanies, 0); assert.equal(dashboard.metrics.activeOpportunities, 0);
      assert.deepEqual((await send(actor, "/companies/options")).json.data.companies, []);
      assert.deepEqual((await send(actor, "/contacts/options")).json.data.contacts, []);
      const report = await send(actor, "/sales-performance?period=custom&from=2026-11-01&to=2026-11-30"); assert.equal(report.status, 200);
      assert.equal((report.json.data.performance as { overall: { opportunitiesCreated: number } }).overall.opportunitiesCreated, 0);
    }
  });
  await t.test("membership changes are immediate on the same opaque session; ownership/session records are unchanged", async () => {
    await assign(["UK"]); assert.deepEqual(await companies("partner"), ["c1"]);
    assert.equal((await send("partner", "/companies/c0")).status, 404);
    assert.equal((await send("partner", "/auth/me")).status, 200);
    assert.deepEqual(owners(), originalOwners);
    assert.deepEqual([...sessions.values()], sessionBefore);
    assert.ok(f.tables.auditLog!.some(row => row.action === "USER_MARKETS_CHANGED"));
  });
  await t.test("Companies CSV and Contacts XLSX complete upload/preview/confirm/persistence through authenticated HTTP, with isolated cleanup", async () => {
    const saved = structuredClone(f.tables);
    try {
      const upload = async (entity: string, filename: string, bytes: Uint8Array) => {
        const form = new FormData(); form.set("entity", entity); form.set("file", new Blob([new Uint8Array(bytes)]), filename);
        const response = await fetch(base + "/imports/parse", { method: "POST", headers: { Cookie: `${env.COOKIE_NAME}=${tokens.get("admin")}` }, body: form });
        assert.equal(response.status, 200);
        return (await response.json() as {data:{preview:{rows:Array<{rowNumber:number;included:boolean;status:string;values:Record<string,string|null>}>}}}).data.preview;
      };
      const names = ["Isolated import Jordan", "Isolated import US", "Isolated import UK", "Isolated import Other"];
      const territories = [["JO","JO"],["US","US"],["GB","UK"],["CA","OTHER"]];
      const csv = "Company Name,Country Code,Sales Market\n" + names.map((name,i)=>[name,...territories[i]!].join(",")).join("\n");
      const before = structuredClone(f.tables);
      const preview = await upload("COMPANIES", "isolated.csv", Buffer.from(csv));
      assert.deepEqual(f.tables, before, "Preview must not persist business or audit rows");
      assert.equal(preview.rows.length, 4); assert.ok(preview.rows.every(row=>row.included && row.status!=="INVALID"));
      const confirmation = {entity:"COMPANIES",rows:preview.rows.map(row=>({rowNumber:row.rowNumber,included:row.included,values:row.values}))};
      const imported = await send("admin", "/imports/commit", "POST", confirmation);
      assert.equal(imported.status,200); assert.equal((imported.json.data.result as {created:number}).created,4);
      const companies = names.map(name=>f.tables.company!.find(row=>row.name===name)!);
      assert.ok(companies.every(Boolean));
      companies.forEach((row,i)=>{assert.equal(row.countryCode,territories[i]![0]);assert.equal(row.salesMarketCode,territories[i]![1]);assert.equal(row.ownerId,"admin");});
      const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet("Contacts");
      sheet.addRow(["Company Name","Name","Email","Primary"]);
      names.forEach((name,i)=>sheet.addRow([name,"Isolated contact "+i,`person${i}@isolated.invalid`,"Yes"]));
      const beforeContactPreview = structuredClone(f.tables);
      const contacts = await upload("CONTACTS","isolated.xlsx",Buffer.from(await workbook.xlsx.writeBuffer()));
      assert.deepEqual(f.tables,beforeContactPreview); assert.ok(contacts.rows.every(row=>row.status==="READY"));
      const contactInput={entity:"CONTACTS",rows:contacts.rows};
      const committed=await send("admin","/imports/commit","POST",contactInput);assert.equal(committed.status,200);assert.equal((committed.json.data.result as {created:number}).created,4);
      companies.forEach((company,i)=>{const contact=f.tables.contact!.find(row=>row.email===`person${i}@isolated.invalid`)!;assert.equal(contact.companyId,company.id);assert.equal(contact.isPrimary,true);});
      const duplicate=await send("admin","/imports/commit","POST",contactInput);assert.equal((duplicate.json.data.result as {duplicates:number;created:number}).duplicates,4);assert.equal((duplicate.json.data.result as {created:number}).created,0);
      await assign(["JO"]);
      const rejected=await send("partner","/imports/commit","POST",{entity:"CONTACTS",rows:[{rowNumber:1,included:true,values:{"Company Name":names[2],Name:"Must not link"}}]});
      assert.equal((rejected.json.data.result as {created:number}).created,0);assert.equal((rejected.json.data.result as {invalid:number}).invalid,1);
      assert.ok(!f.tables.contact!.some(row=>row.name==="Must not link"));
    } finally {
      for (const [model,rows] of Object.entries(saved)) f.tables[model]=rows;
    }
  });
});
