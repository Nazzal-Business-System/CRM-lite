import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { readFileSync } from "node:fs";
import ExcelJS from "exceljs";
import { COUNTRY_CODES, createCompanySchema, updateCompanySchema, type AuthUser } from "@nbs/shared";
import { prisma } from "../lib/prisma";
import type { Prisma } from "../generated/prisma/client";
import { createCompany, updateCompany, getCompany, listCompanies } from "./companies.service";
import { backfillLegacyCompanyTerritories, provisionSalesMarkets } from "./markets.service";
import { buildTemplateWorkbook, commitImport, parseImportFile } from "./imports.service";

import { env } from "../env";
env.MARKET_ACCESS_MODE = "legacy";

const actor = { id: "owner", permissions: [] } as unknown as AuthUser;
const createInput = (overrides = {}) => createCompanySchema.parse({ name: "International", countryCode: "GB", salesMarketCode: "JO", ...overrides });
// Prisma delegates are proxies; assign the boundary explicitly and restore after each test.
function stub(t: TestContext, target: object, key: string, implementation: unknown) {
  const original = Reflect.get(target, key);
  Reflect.set(target, key, implementation);
  t.after(() => { Reflect.set(target, key, original); });
}
function fixture(t: TestContext) {
  const markets = new Map(["JO", "UK", "US", "OTHER"].map((code) => [code, { code, name: code, nameAr: code }]));
  const now = new Date("2026-11-04T00:00:00Z");
  let row = {
    id: "company", name: "Legacy", nameNormalized: "legacy", website: null, websiteDomain: null,
    sector: null, companySize: "UNKNOWN", locations: "Unstructured legacy address", source: "RESEARCH",
    companyFit: null, problemPotential: null, decisionMakerAccess: null, qualificationScore: null,
    priority: null, ownerId: actor.id, owner: { id: actor.id, name: "Owner" }, generalNotes: "Preserve notes",
    countryCode: null, salesMarketCode: null, countryMarketLegacyCohort: true, createdAt: now, updatedAt: now,
    _count: { contacts: 2, opportunities: 3, tasks: 4 },
  } as Record<string, unknown>;
  const writes: Record<string, unknown>[] = [];
  let outage = false;
  stub(t, prisma.salesMarket, "findUnique", async ({ where }: { where: { code: string } }) => {
    if (outage) throw new Error("isolated database outage");
    return markets.get(where.code) ?? null;
  });
  stub(t, prisma.salesMarket, "findMany", async () => [...markets.values()]);
  stub(t, prisma.user, "findUnique", async ({ where }: { where: { id: string } }) => ({ id: where.id, isActive: true }));
  stub(t, prisma.company, "findFirst", async () => null);
  stub(t, prisma.company, "findUnique", async () => row);
  stub(t, prisma.company, "findMany", async () => []);
  stub(t, prisma.company, "create", async ({ data }: { data: Record<string, unknown> }) => { writes.push(data); row = { ...row, ...data }; return row; });
  stub(t, prisma.company, "update", async ({ data }: { data: Record<string, unknown> }) => { writes.push(data); row = { ...row, ...data }; return row; });
  stub(t, prisma.opportunity, "groupBy", async () => []);
  stub(t, prisma.task, "groupBy", async () => []);
  stub(t, prisma.activity, "groupBy", async () => []);
  stub(t, prisma.auditLog, "create", async () => ({}));
  return { writes, markets, get row() { return row; }, setOutage: () => { outage = true; } };
}

test("company schemas require explicit independent country and territory, supporting all ISO countries", () => {
  assert.equal(COUNTRY_CODES.length, 249);
  assert.equal(new Set(COUNTRY_CODES).size, 249);
  assert.equal(createCompanySchema.safeParse({ name: "Missing" }).success, false);
  for (const countryCode of ["UK", "XX", "OTHER", "", null]) assert.equal(createCompanySchema.safeParse({ name: "Invalid", countryCode, salesMarketCode: "UK" }).success, false);
  assert.deepEqual([createInput({ countryCode: " ca ", salesMarketCode: " us " }).countryCode, createInput({ countryCode: " ca ", salesMarketCode: " us " }).salesMarketCode], ["CA", "US"]);
  assert.equal(updateCompanySchema.safeParse({ generalNotes: "Legacy update" }).success, true);
  assert.equal(updateCompanySchema.safeParse({ countryCode: null }).success, false);
  assert.equal(updateCompanySchema.safeParse({ salesMarketCode: "" }).success, false);
});

test("CRUD persists independent country/market and preserves ownership and related counts", async (t) => {
  const f = fixture(t);
  const result = await createCompany(createInput({ generalNotes: "Preserve notes" }), actor);
  assert.equal(result.countryCode, "GB"); assert.equal(result.salesMarketCode, "JO");
  assert.equal(f.writes[0]?.ownerId, actor.id);
  assert.equal(result.contactCount, 2); assert.equal(result.opportunityCount, 3);
  await updateCompany("company", updateCompanySchema.parse({ countryCode: "US", salesMarketCode: "UK" }), actor);
  assert.equal(f.row.countryCode, "US"); assert.equal(f.row.salesMarketCode, "UK");
  assert.equal(f.row.generalNotes, "Preserve notes");
  await assert.rejects(updateCompany("company", { ownerId: "another-user" }, actor), /Only authorized administrators/);
});

test("legacy reads and ordinary PATCH preserve NULL geography without implicit Jordan", async (t) => {
  const f = fixture(t);
  const company = await getCompany("company");
  assert.equal(company.countryCode, null); assert.equal(company.salesMarketCode, null);
  await updateCompany("company", { generalNotes: "Edited" }, actor);
  assert.equal(f.row.countryCode, null); assert.equal(f.row.salesMarketCode, null);
  assert.equal("countryCode" in f.writes[0]!, false);
  assert.equal("countryMarketLegacyCohort" in f.writes[0]!, false);
  stub(t, prisma.company, "findMany", async () => [f.row]);
  const result = await listCompanies({ page: 1, pageSize: 20, search: "", sort: "name", order: "asc" });
  assert.equal(result.items[0]?.salesMarketCode, null);
});

test("unknown markets and infrastructure failures never create a company", async (t) => {
  const f = fixture(t);
  await assert.rejects(createCompany(createInput({ salesMarketCode: "UNKNOWN" }), actor), /unsupported market/);
  f.setOutage();
  await assert.rejects(createCompany(createInput(), actor), /database outage/);
  assert.equal(f.writes.length, 0);
});

const commit = (values: Record<string, string | null>) => ({ entity: "COMPANIES" as const, rows: [{ rowNumber: 1, included: true, values }] });
test("CSV and XLSX preview require geography; commit revalidates edited and forged rows", async (t) => {
  const f = fixture(t);
  const missing = await parseImportFile("COMPANIES", "legacy.csv", Buffer.from("Company Name\nMissing fields\n"));
  assert.equal(missing.counts.invalid, 1); assert.equal(missing.rows[0]?.included, false);
  for (const values of [
    { "Company Name": "Invalid", "Country Code": "XX", "Sales Market": "JO" },
    { "Company Name": "Invalid", "Country Code": "JO", "Sales Market": "UNKNOWN" },
    { "Company Name": "Invalid", "Country Code": "JO", "Sales Market": "" },
  ]) {
    const result = await commitImport("COMPANIES", commit(values), actor);
    assert.equal(result.invalid, 1); assert.equal(result.created, 0);
  }
  assert.equal(f.writes.length, 0);
  const csv = Buffer.from("Company Name,Country Code,Sales Market\nGood,gb,US\n");
  const preview = await parseImportFile("COMPANIES", "good.csv", csv);
  assert.equal(preview.counts.invalid, 0);
  const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet("Companies");
  sheet.addRow(["Company Name", "Country Code", "Sales Market"]); sheet.addRow(["XLSX", "CA", "UK"]);
  const xlsxPreview = await parseImportFile("COMPANIES", "good.xlsx", Buffer.from(await workbook.xlsx.writeBuffer()));
  assert.equal(xlsxPreview.counts.invalid, 0);
  const result = await commitImport("COMPANIES", commit(preview.rows[0]!.values), actor);
  assert.equal(result.created, 1); assert.equal(f.writes[0]?.countryCode, "GB"); assert.equal(f.writes[0]?.salesMarketCode, "US");
  assert.equal(f.writes[0]?.ownerId, actor.id);
  assert.equal("countryMarketLegacyCohort" in f.writes[0]!, false);
});

test("templates expose required territory columns, ISO country list and configured future markets", async (t) => {
  const f = fixture(t); f.markets.set("GCC", { code: "GCC", name: "Gulf", nameAr: "Gulf" });
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(await buildTemplateWorkbook("COMPANIES") as unknown as ExcelJS.Buffer);
  const sheet = workbook.worksheets[0]!;
  assert.equal(sheet.getCell(1, 2).value, "Country Code"); assert.equal(sheet.getCell(1, 3).value, "Sales Market");
  assert.notEqual(sheet.getCell(2, 2).dataValidation.allowBlank, true);
  assert.deepEqual(sheet.getCell(2, 2).dataValidation.formulae, ["CountryCodes"]);
  assert.equal(workbook.getWorksheet("Territory codes")?.state, "hidden");
  assert.equal(workbook.getWorksheet("Territory codes")?.getCell(5, 2).value, "GCC");
});

test("market seed is additive/idempotent; backfill excludes future, partial and explicitly assigned records", async () => {
  const markets = new Map([["JO", { code: "JO", name: "Custom Jordan", nameAr: "Custom" }], ["GCC", { code: "GCC", name: "Gulf", nameAr: "Gulf" }]]);
  const records = [
    { id: "legacy", countryMarketLegacyCohort: true, countryCode: null as string | null, salesMarketCode: null as string | null },
    { id: "future-backdated", countryMarketLegacyCohort: false, countryCode: null, salesMarketCode: null },
    { id: "partial", countryMarketLegacyCohort: true, countryCode: "GB", salesMarketCode: null },
    { id: "explicit", countryMarketLegacyCohort: true, countryCode: "US", salesMarketCode: "UK" },
  ];
  const tx = {
    salesMarket: {
      findUnique: async ({ where }: { where: { code: string } }) => markets.get(where.code),
      upsert: async ({ create }: { create: { code: string; name: string; nameAr: string } }) => { if (!markets.has(create.code)) markets.set(create.code, create); },
    },
    company: { updateMany: async ({ where, data }: { where: Record<string, unknown>; data: { countryCode: string; salesMarketCode: string } }) => {
      let count = 0;
      for (const row of records) if (Object.entries(where).every(([key, value]) => row[key as keyof typeof row] === value)) { Object.assign(row, data); count++; }
      return { count };
    } },
  } as unknown as Prisma.TransactionClient;
  await provisionSalesMarkets(tx); await provisionSalesMarkets(tx);
  assert.equal(markets.size, 5); assert.equal(markets.get("JO")?.name, "Custom Jordan");
  assert.equal((await backfillLegacyCompanyTerritories(tx)).count, 1);
  assert.equal((await backfillLegacyCompanyTerritories(tx)).count, 0);
  assert.equal(records[0]?.countryCode, "JO");
  assert.equal(records[1]?.countryCode, null); assert.equal(records[1]?.salesMarketCode, null);
  assert.equal(records[2]?.salesMarketCode, null); assert.equal(records[3]?.salesMarketCode, "UK");
});

test("migration captures the cohort atomically, resets future defaults and constrains future inserts", () => {
  const sql = readFileSync(new URL("../../prisma/migrations/20261104120000_company_countries_markets/migration.sql", import.meta.url), "utf8");
  assert.match(sql, /BEGIN;/); assert.match(sql, /COMMIT;/);
  assert.match(sql, /"countryMarketLegacyCohort" BOOLEAN NOT NULL DEFAULT true/);
  assert.match(sql, /ALTER COLUMN "countryMarketLegacyCohort" SET DEFAULT false/);
  assert.match(sql, /CHECK \("countryMarketLegacyCohort" OR \("countryCode" IS NOT NULL AND "salesMarketCode" IS NOT NULL\)\)/);
  assert.doesNotMatch(sql.replace(/^--.*$/gm, ""), /UPDATE "companies"|DELETE FROM|createdAt/);
});


test("contact import remains compatible with legacy companies lacking structured geography", async (t) => {
  const f = fixture(t);
  stub(t, prisma.company, "findMany", async () => [f.row]);
  stub(t, prisma.contact, "findFirst", async () => null);
  let contactWrites = 0;
  stub(t, prisma.contact, "create", async ({ data }: { data: { companyId: string } }) => { assert.equal(data.companyId, "company"); contactWrites++; return {}; });
  const preview = await parseImportFile("CONTACTS", "contacts.csv", Buffer.from("Company Name,Name\nLegacy,Contact Person\n"));
  assert.equal(preview.counts.invalid, 0);
  const result = await commitImport("CONTACTS", { entity: "CONTACTS", rows: preview.rows }, actor);
  assert.equal(result.created, 1); assert.equal(contactWrites, 1); assert.equal(f.writes.length, 0);
});
