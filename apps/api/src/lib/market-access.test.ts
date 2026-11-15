import assert from "node:assert/strict";
import test from "node:test";
import { PERMISSION_KEYS, replaceMarketMembershipsSchema, type AuthUser } from "@nbs/shared";
import { prisma } from "./prisma";
import { env } from "../env";
import { marketContext, withMarketMaintenance } from "./market-context";
import { installMarketStore } from "../test/market-store";
import { listUserMarkets, replaceUserMarkets } from "../services/market-memberships.service";
import { listCompanyOptions, getCompany, createCompany, findCompanyDuplicates } from "../services/companies.service";
import { createCompanySchema } from "@nbs/shared";
import { parseImportFile, commitImport } from "../services/imports.service";
import { getDashboard } from "../services/dashboard.service";
import { getSalesPerformance, getSalespersonPerformance } from "../services/sales-performance.service";

const actor = (id = "partner", admin = false, permissions: string[] = []): AuthUser => ({ id, role: { id: admin ? "admin-role" : "sales-role", name: admin ? "Admin" : "Sales", isSystem: true, description: null }, permissions } as AuthUser);
const admin = actor("admin", true, [PERMISSION_KEYS.MARKETS_MANAGE_MEMBERSHIPS]);
const run = <T>(who: AuthUser, action: () => T) => marketContext.run({ actor: () => who }, action);

test("Admin is global; partners see multiple assigned markets, never legacy NULLs", async (t) => {
  installMarketStore(t); env.MARKET_ACCESS_MODE = "enforced";
  assert.equal((await run(admin, () => prisma.company.findMany())).length, 4);
  assert.deepEqual((await run(actor(), () => prisma.company.findMany())).map((r) => r.id), ["c0", "c2"]);
  assert.equal(await run(actor("unassigned"), () => prisma.company.count()), 0);
  assert.equal(await run(actor(), () => prisma.company.findUnique({ where: { id: "c1" } })), null);
  assert.equal(await run(actor(), () => prisma.company.findUnique({ where: { id: "c3" } })), null);
  const customAdmin = { ...actor(), role: { ...admin.role, isSystem: false } };
  assert.equal(await run(customAdmin, () => prisma.company.count()), 2);
});

test("lookups, duplicate suggestions and direct company services cannot reveal hidden records", async (t) => {
  installMarketStore(t);
  assert.equal((await run(actor(), () => listCompanyOptions("Company 1"))).length, 0);
  await assert.rejects(run(actor(), () => getCompany("c1")), /not found/);
  assert.equal((await run(actor(), () => findCompanyDuplicates({ nameNormalized: "company 1", websiteDomain: null }))).length, 0);
  assert.equal((await run(actor(), () => findCompanyDuplicates({ nameNormalized: "company 0", websiteDomain: null }))).length, 1);
  const input = createCompanySchema.parse({ name: "Company 1", countryCode: "JO", salesMarketCode: "JO" });
  await assert.rejects(run(actor(), () => createCompany(input, actor())), /cannot be created with these identifiers/);
});

test("related records, indirect tasks, research and aggregates are scoped before pagination", async (t) => {
  installMarketStore(t);
  await run(actor(), async () => {
    assert.deepEqual((await prisma.contact.findMany()).map((r) => r.id), ["p0", "p2"]);
    assert.deepEqual((await prisma.opportunity.findMany()).map((r) => r.id), ["o0", "o2"]);
    assert.deepEqual((await prisma.activity.findMany()).map((r) => r.id), ["a0", "a2"]);
    assert.deepEqual((await prisma.task.findMany()).map((r) => r.id), ["t0"]);
    assert.equal(await prisma.researchEvidence.count(), 1); assert.equal(await prisma.hypothesis.count(), 1);
    assert.equal((await prisma.company.findMany({ skip: 1, take: 1 }))[0]?.id, "c2");
    const grouped = await prisma.opportunity.groupBy({ by: ["stage"], _count: { _all: true } });
    assert.equal(grouped[0]?._count._all, 2);
  });
});

test("nested relation lists and counts carry their own market predicates", async (t) => {
  const f = installMarketStore(t);
  await run(actor(), () => prisma.company.findMany({ include: { tasks: true, _count: { select: { tasks: true } } } }));
  const args = f.calls.find((call) => call.model === "company" && call.operation === "findMany")!.args;
  assert.ok(JSON.stringify(args.include).includes('"salesMarketCode":{"in":["JO","US"]}'));
});

test("writes deny hidden targets, cross-company links and unauthorized market moves", async (t) => {
  const f = installMarketStore(t);
  await run(actor(), async () => {
    assert.equal((await prisma.company.updateMany({ where: { id: "c1" }, data: { generalNotes: "bad" } })).count, 0);
    assert.equal((await prisma.company.deleteMany({ where: { id: "c1" } })).count, 0);
    await assert.rejects(prisma.company.update({ where: { id: "c0" }, data: { salesMarketCode: "UK" } }), /Only system Admins/);
    await assert.rejects(prisma.contact.create({ data: { companyId: "c1", name: "Hidden" } }), /Company not found/);
    await assert.rejects(prisma.task.create({ data: { title: "Hidden", dueAt: new Date(), ownerId: "partner", opportunityId: "o1" } }), /Related record not found/);
    await assert.rejects(prisma.task.create({ data: { title: "Cross link", dueAt: new Date(), ownerId: "partner", companyId: "c0", contactId: "p2" } }), /same company/);
    await assert.rejects(prisma.company.update({ where: { id: "c0" }, data: { salesMarket: { connect: { code: "UK" } } } }), /Nested relationship/);
    await assert.rejects(prisma.company.create({ data: { name: "Bypass", nameNormalized: "bypass", countryMarketLegacyCohort: true } }), /legacy-cohort/);
  });
  assert.equal(f.tables.company!.find((r) => r.id === "c1")?.generalNotes, null);
});

test("owners and explicitly changed commission representatives must be eligible without automatic reassignment", async (t) => {
  const f = installMarketStore(t);
  await run(admin, async () => {
    await assert.rejects(prisma.company.update({ where: { id: "c0" }, data: { ownerId: "uk" } }), /not eligible/);
    await assert.rejects(prisma.opportunity.update({ where: { id: "o0" }, data: { commissionRepresentativeId: "uk" } }), /not eligible/);
    await prisma.company.update({ where: { id: "c0" }, data: { ownerId: "admin" } });
  });
  assert.equal(f.tables.company![0]?.ownerId, "admin");
  assert.equal(f.tables.opportunity![0]?.ownerId, "partner");
  assert.equal(f.tables.opportunity![0]?.commissionRepresentativeId, null);
});

test("imports validate requested markets at preview and recheck forged commit rows", async (t) => {
  const f = installMarketStore(t);
  await run(actor(), async () => {
    const preview = await parseImportFile("COMPANIES", "fixture.csv", Buffer.from("Company Name,Country Code,Sales Market\nHidden Import,GB,UK\nAllowed Import,US,US\n"));
    assert.equal(preview.rows[0]?.status, "INVALID"); assert.notEqual(preview.rows[1]?.status, "INVALID");
    const result = await commitImport("COMPANIES", { entity: "COMPANIES", rows: [{ rowNumber: 1, included: true, values: { "Company Name": "Forged", "Country Code": "GB", "Sales Market": "UK" } }] }, actor());
    assert.equal(result.created, 0); assert.equal(result.invalid, 1);
    const contacts = await parseImportFile("CONTACTS", "fixture.csv", Buffer.from("Company Name,Name\nCompany 1,Hidden Contact\n"));
    assert.equal(contacts.rows[0]?.status, "INVALID");
  });
  assert.equal(f.tables.company!.length, 4);
});

test("dashboards and reporting aggregate visible companies only", async (t) => {
  installMarketStore(t);
  await run(actor(), async () => {
    const dashboard = await getDashboard();
    assert.equal(dashboard.metrics.totalCompanies, 2);
    assert.equal(dashboard.metrics.activeOpportunities, 2);
    assert.equal(dashboard.overdueTasks.length, 1);
    const report = await getSalesPerformance({ period: "custom", from: "2026-11-01", to: "2026-11-30" });
    assert.equal(report.overall.opportunitiesCreated, 2);
  });
});

test("polymorphic notifications, governance and audit payloads cannot disclose other markets", async (t) => {
  installMarketStore(t);
  await run(actor(), async () => {
    assert.deepEqual((await prisma.notification.findMany({ where: { recipientUserId: "partner" } })).map((r) => r.id), ["n0"]);
    assert.equal(await prisma.auditLog.count(), 0);
    await assert.rejects(prisma.ownershipRequest.create({ data: { entityType: "COMPANY", entityId: "c1", entityLabel: "Hidden", requesterUserId: "partner", requestedOwnerId: "partner" } }), /not found/);
  });
});

test("membership API service requires system Admin AND permission; replacements are transactional and do not change business records", async (t) => {
  const f = installMarketStore(t); const before = structuredClone([f.tables.company, f.tables.opportunity]);
  await assert.rejects(run(actor(), () => replaceUserMarkets("partner", ["UK"], actor())), /System Admin/);
  await assert.rejects(run(actor("admin", true), () => replaceUserMarkets("partner", ["UK"], actor("admin", true))), /permission/);
  await run(admin, async () => {
    await replaceUserMarkets("partner", ["JO", "UK"], admin);
    assert.equal((await listUserMarkets("partner", admin)).length, 2);
    await replaceUserMarkets("partner", ["JO", "UK"], admin);
    await assert.rejects(replaceUserMarkets("partner", ["UNKNOWN"], admin), /configured sales market/);
    f.setAuditOutage(true);
    await assert.rejects(replaceUserMarkets("partner", ["US"], admin), /audit outage/);
    f.setAuditOutage(false);
    assert.deepEqual((await listUserMarkets("partner", admin)).map((r) => r.marketCode).sort(), ["JO", "UK"]);
  });
  assert.ok(f.tables.userSalesMarket!.some((row) => row.userId === "uk" && row.marketCode === "UK"));
  assert.deepEqual([f.tables.company, f.tables.opportunity], before);
  assert.equal(await run(actor(), () => prisma.company.count()), 2); // JO + UK; fresh request rereads membership.
  assert.equal(await run(actor(), () => prisma.company.findUnique({ where: { id: "c2" } })), null);
  assert.equal(replaceMarketMembershipsSchema.safeParse({ marketCodes: ["JO", "jo"] }).success, false);
});

test("authorization outages fail closed as 503 and recover on a new request", async (t) => {
  const f = installMarketStore(t); f.setOutage(true);
  await assert.rejects(run(actor(), () => prisma.company.count()), (error: unknown) => (error as { status: number }).status === 503);
  f.setOutage(false); assert.equal(await run(actor(), () => prisma.company.count()), 2);
});

test("transaction delegates enforce the same boundary and rollback denied writes", async (t) => {
  const f = installMarketStore(t);
  await assert.rejects(run(actor(), () => prisma.$transaction(async (tx) => {
    await tx.company.update({ where: { id: "c0" }, data: { generalNotes: "rollback me" } });
    await tx.contact.create({ data: { name: "Blocked", companyId: "c1" } });
  })), /not found/);
  assert.equal(f.tables.company![0]?.generalNotes, null);
});

test("enforced mode requires explicit context, legacy rollout mode is explicit, and role escalation cannot bypass markets", async (t) => {
  installMarketStore(t);
  await assert.rejects(prisma.company.count(), /context is required/);
  assert.equal(await withMarketMaintenance(() => prisma.company.count()), 4);
  await run(actor(), async () => {
    await assert.rejects(prisma.user.update({ where: { id: "partner" }, data: { roleId: "admin-role" } }), /Only system Admins/);
    await assert.rejects(prisma.user.update({ where: { id: "admin" }, data: { passwordHash: "never-written" } }), /Only system Admins/);
  });
  env.MARKET_ACCESS_MODE = "legacy";
  try { assert.equal(await prisma.company.count(), 4); } finally { env.MARKET_ACCESS_MODE = "enforced"; }
});


test("parallel request contexts never reuse another user's membership or cached outage", async (t) => {
  installMarketStore(t);
  const [first, second] = await Promise.all([
    run(actor(), () => prisma.company.findMany()),
    run(actor("uk"), () => prisma.company.findMany()),
  ]);
  assert.deepEqual(first.map((r) => r.id), ["c0", "c2"]);
  assert.deepEqual(second.map((r) => r.id), ["c1"]);
});

test("Admin market moves validate existing related owners without rewriting attribution", async (t) => {
  const f = installMarketStore(t);
  await run(admin, async () => {
    await prisma.company.update({ where: { id: "c0" }, data: { ownerId: "admin" } });
    await assert.rejects(prisma.company.update({ where: { id: "c0" }, data: { salesMarketCode: "UK" } }), /not eligible/);
    assert.equal(f.tables.company![0]?.salesMarketCode, "JO");
  });
});


test("country never grants territory access and every related direct-ID mutation is fenced", async (t) => {
  const f = installMarketStore(t);
  f.tables.company![0]!.countryCode = "GB";
  f.tables.company![1]!.countryCode = "JO";
  await run(actor(), async () => {
    assert.ok(await prisma.company.findUnique({ where: { id: "c0" } }));
    assert.equal(await prisma.company.findUnique({ where: { id: "c1" } }), null);
    for (const [model, id] of [["contact", "p1"], ["opportunity", "o1"], ["activity", "a1"], ["task", "t1"], ["researchEvidence", "e1"], ["hypothesis", "h1"]]) {
      const delegate = Reflect.get(prisma, model!) as { findUnique: (args: unknown) => Promise<unknown>; updateMany: (args: unknown) => Promise<{ count: number }> };
      assert.equal(await delegate.findUnique({ where: { id } }), null);
      assert.equal((await delegate.updateMany({ where: { id }, data: { updatedAt: new Date() } })).count, 0);
    }
    await assert.rejects(prisma.contact.update({ where: { id: "p0" }, data: { companyId: "c2" } }), /reviewed reconciliation/);
  });
});


test("deletion cannot use foreign-key side effects to modify hidden legacy cross-links", async (t) => {
  const f = installMarketStore(t);
  await assert.rejects(run(actor("uk"), () => prisma.contact.delete({ where: { id: "p1" } })), /Linked CRM records prevent deletion/);
  assert.ok(f.tables.contact!.some((row) => row.id === "p1"));
  assert.equal(f.tables.task!.find((row) => row.id === "bad-link")?.contactId, "p1");
});


test("Admin can edit legacy NULL-market records without rewriting or requalifying unchanged historical owners", async (t) => {
  const f = installMarketStore(t);
  await run(admin, async () => {
    await prisma.company.update({ where: { id: "c3" }, data: { generalNotes: "Reviewed legacy notes", ownerId: "partner" } });
    await prisma.opportunity.update({ where: { id: "o3" }, data: { name: "Reviewed legacy deal", ownerId: "partner", companyId: "c3", commissionRepresentativeId: null } });
  });
  assert.equal(f.tables.company![3]?.ownerId, "partner");
  assert.equal(f.tables.company![3]?.salesMarketCode, null);
  assert.equal(f.tables.opportunity![3]?.ownerId, "partner");
  assert.equal(await run(actor(), () => prisma.company.findUnique({ where: { id: "c3" } })), null);
});


test("salesperson detail trend cannot aggregate hidden activities owned by the same user", async (t) => {
  const f = installMarketStore(t);
  f.tables.activity![1]!.ownerId = "partner"; // UK activity must stay hidden despite matching salesperson.
  await run(actor(), async () => {
    const detail = await getSalespersonPerformance("partner", { period: "custom", from: "2026-11-01", to: "2026-11-30" });
    assert.deepEqual(detail.activityTrend, [{ date: "2026-11-07", count: 2 }]);
    assert.deepEqual(detail.recentActivities.map((r) => r.id), ["a0", "a2"]);
    assert.equal(detail.assignedCompanies.length, 2);
  });
});


test("market administration cannot lose the last active global Admin to a custom admin-capable role", async () => {
  const { assertGlobalMarketAdminSurvives } = await import("./market-access");
  let remaining = 0; let locks = 0;
  const tx = { $queryRaw: async () => { locks++; return []; }, user: { count: async () => remaining } } as unknown as import("../generated/prisma/client").Prisma.TransactionClient;
  const existing = { id: "admin", roleId: "admin-role", isActive: true, role: admin.role };
  await assert.rejects(assertGlobalMarketAdminSurvives(tx, existing, { isActive: false }), /last active system Admin/);
  await assert.rejects(assertGlobalMarketAdminSurvives(tx, existing, { roleId: "custom-admin-capable-role" }), /last active system Admin/);
  remaining = 1;
  await assertGlobalMarketAdminSurvives(tx, existing, { isActive: false });
  assert.equal(locks, 3);
});
