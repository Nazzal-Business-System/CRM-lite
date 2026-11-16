import type { TestContext } from "node:test";
import { prisma } from "../lib/prisma";

type Row = Record<string, unknown>;
type Args = { where?: Row; data?: Row | Row[]; select?: Row; include?: Row; take?: number; skip?: number; by?: string[]; _count?: unknown; _sum?: Row; _min?: Row; _max?: Row };
const object = (v: unknown): Row => v && typeof v === "object" ? v as Row : {};
export function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (key === "AND") return (Array.isArray(value) ? value : [value]).every((v) => matches(row, object(v)));
    if (key === "OR") return (value as Row[]).some((v) => matches(row, v));
    if (key === "NOT") return !matches(row, object(value));
    const actual = row[key];
    if (value === null || typeof value !== "object" || value instanceof Date) return actual === value;
    const filter = object(value);
    if ("is" in filter) return filter.is === null ? actual == null : actual != null && matches(object(actual), object(filter.is));
    if ("in" in filter) return (filter.in as unknown[]).includes(actual);
    if ("notIn" in filter) return !(filter.notIn as unknown[]).includes(actual);
    if ("not" in filter) return actual !== filter.not;
    if ("contains" in filter) return String(actual ?? "").toLowerCase().includes(String(filter.contains).toLowerCase());
    if ("equals" in filter) return String(actual).toLowerCase() === String(filter.equals).toLowerCase();
    if ("some" in filter) return Array.isArray(actual) && actual.some((v) => matches(object(v), object(filter.some)));
    if (["gte", "lte", "gt", "lt"].some((k) => k in filter)) {
      const time = actual instanceof Date ? actual.getTime() : Number(actual);
      return (!("gte" in filter) || time >= Number(filter.gte)) && (!("lte" in filter) || time <= Number(filter.lte)) && (!("gt" in filter) || time > Number(filter.gt)) && (!("lt" in filter) || time < Number(filter.lt));
    }
    return actual != null && matches(object(actual), filter);
  });
}
export function installMarketStore(t: TestContext) {
  const now = new Date("2026-11-07T00:00:00Z");
  const tables: Record<string, Row[]> = {
    priceBookGrant: [], userPricingPreference: [], pricingEstimateBook: [], pricingEstimateArchive: [],
    pricingEstimate: [],
    role: [{ id: "admin-role", name: "Admin", isSystem: true }, { id: "sales-role", name: "Sales", isSystem: true }],
    user: ["admin", "partner", "uk", "unassigned"].map((id) => ({ id, name: id, email: `${id}@fixture.invalid`, isActive: true, roleId: id === "admin" ? "admin-role" : "sales-role" })),
    salesMarket: ["JO", "UK", "US", "OTHER"].map((code) => ({ code, name: code, nameAr: code })),
    userSalesMarket: [{ userId: "partner", marketCode: "JO" }, { userId: "partner", marketCode: "US" }, { userId: "uk", marketCode: "UK" }].map((r) => ({ ...r, assignedAt: now, assignedByUserId: "admin" })),
    company: ["JO", "UK", "US", null].map((market, i) => ({ id: `c${i}`, name: `Company ${i}`, nameNormalized: `company ${i}`, salesMarketCode: market, countryCode: market === "UK" ? "GB" : market, countryMarketLegacyCohort: market === null, ownerId: market === "UK" ? "uk" : "partner", website: null, websiteDomain: null, sector: null, locations: null, source: "RESEARCH", companySize: "UNKNOWN", companyFit: null, problemPotential: null, decisionMakerAccess: null, qualificationScore: null, priority: null, generalNotes: null, createdAt: now, updatedAt: now })),
    contact: [0, 1, 2, 3].map((i) => ({ id: `p${i}`, companyId: `c${i}`, name: `Person ${i}`, email: null, phone: null, jobTitle: null, notes: null, decisionRole: "UNKNOWN", preferredChannel: "EMAIL", linkedInUrl: null, isPrimary: false, createdAt: now, updatedAt: now })),
    opportunity: [0, 1, 2, 3].map((i) => ({ id: `o${i}`, companyId: `c${i}`, name: `Deal ${i}`, primaryContactId: `p${i}`, stage: "TARGET", ownerId: i === 1 ? "uk" : "partner", commissionRepresentativeId: null, estimatedValue: null, probability: 5, closedAt: null, createdAt: now, updatedAt: now })),
    task: [{ id: "t0", companyId: "c0", contactId: null, opportunityId: null }, { id: "t1", companyId: null, contactId: null, opportunityId: "o1" }, { id: "personal", companyId: null, contactId: null, opportunityId: null }, { id: "bad-link", companyId: "c0", contactId: "p1", opportunityId: null }].map((r) => ({ ...r, title: r.id, description: null, ownerId: "partner", dueAt: new Date("2026-11-06"), status: "OPEN", completedAt: null, createdAt: now, updatedAt: now })),
    activity: [0, 1, 2, 3].map((i) => ({ id: `a${i}`, companyId: `c${i}`, contactId: null, opportunityId: null, type: "CALL", summary: `Call ${i}`, outcome: null, ownerId: i === 1 ? "uk" : "partner", occurredAt: now, createdAt: now, updatedAt: now })),
    researchEvidence: [0, 1].map((i) => ({ id: `e${i}`, companyId: `c${i}`, title: `Evidence ${i}`, details: "synthetic", category: null, sourceUrl: null, sourceName: null, observedAt: null, createdById: "admin", createdAt: now, updatedAt: now })),
    hypothesis: [0, 1].map((i) => ({ id: `h${i}`, companyId: `c${i}`, statement: "synthetic", supportingContext: null, status: "UNTESTED", createdById: "admin", createdAt: now, updatedAt: now })),
    auditLog: [], notification: [{ id: "n0", recipientUserId: "partner", entityType: "COMPANY", entityId: "c0" }, { id: "n1", recipientUserId: "partner", entityType: "COMPANY", entityId: "c1" }],
    ownershipRequest: [], permission: [], rolePermission: [],
  };
  let outage = false; let auditOutage = false;
  const calls: Array<{ model: string; operation: string; args: Args }> = [];
  const find = (model: string, id: unknown) => tables[model]!.find((r) => r.id === id);
  function enrich(model: string, row: Row): Row {
    const r = { ...row };
    if (model === "user") { r.role = find("role", r.roleId); r.marketMemberships = tables.userSalesMarket!.filter((m) => m.userId === r.id); }
    if (model === "pricingEstimate") { r.priceBookSnapshot = tables.pricingEstimateBook!.find(book => book.estimateId === row.id) ?? null; r.archive = tables.pricingEstimateArchive!.find(a => a.estimateId === row.id) ?? null; }
    if (model === "userSalesMarket") r.market = tables.salesMarket!.find((m) => m.code === r.marketCode);
    if (row.companyId) r.company = find("company", row.companyId);
    if (row.contactId) r.contact = enrich("contact", find("contact", row.contactId)!);
    if (row.primaryContactId) r.primaryContact = enrich("contact", find("contact", row.primaryContactId)!);
    if (row.opportunityId) r.opportunity = enrich("opportunity", find("opportunity", row.opportunityId)!);
    if (row.ownerId) r.owner = find("user", row.ownerId);
    if (row.createdById) r.createdBy = find("user", row.createdById);
    if (model === "company") {
      r._count = { contacts: tables.contact!.filter((c) => c.companyId === row.id).length, opportunities: tables.opportunity!.filter((c) => c.companyId === row.id).length, tasks: tables.task!.filter((c) => c.companyId === row.id).length };
    }
    return r;
  }
  function project(row: Row, args: Args): Row {
    if (!args.select) return row;
    return Object.fromEntries(Object.entries(args.select).filter(([,v]) => v).map(([key, selection]) => [key, typeof selection === "object" && row[key] != null ? Array.isArray(row[key]) ? row[key].map(value => project(object(value), selection as Args)) : project(object(row[key]), selection as Args) : row[key]]));
  }
  const raw: Record<string, Record<string, (args?: Args) => Promise<unknown>>> = {};
  for (const model of Object.keys(tables)) {
    raw[model] = {};
    for (const operation of ["findUnique", "findFirst", "findMany", "count", "aggregate", "groupBy", "create", "createMany", "update", "updateMany", "delete", "deleteMany", "upsert"]) {
      raw[model]![operation] = async (args: Args = {}) => {
        calls.push({ model, operation, args });
        if (outage) throw Object.assign(new Error("isolated database outage"), { code: "P1001" });
        if (auditOutage && model === "auditLog" && operation === "create") throw new Error("isolated audit outage");
        const rows = tables[model]!.map((r) => enrich(model, r)).filter((r) => matches(r, args.where));
        if (operation === "findMany") return rows.slice(args.skip ?? 0, args.take ? (args.skip ?? 0) + args.take : undefined).map((r) => project(r, args));
        if (operation === "findFirst" || operation === "findUnique") return rows[0] ? project(rows[0], args) : null;
        if (operation === "count") return rows.length;
        if (operation === "aggregate") return { _min: { dueAt: null } };
        if (operation === "groupBy") {
          const groups = new Map<string, Row[]>();
          for (const row of rows) { const key = JSON.stringify(args.by?.map((k) => row[k])); groups.set(key, [...groups.get(key) ?? [], row]); }
          return [...groups.values()].map((group) => ({ ...Object.fromEntries((args.by ?? []).map((k) => [k, group[0]![k]])), _count: { _all: group.length }, _sum: { estimatedValue: null }, _min: { dueAt: null }, _max: { occurredAt: null } }));
        }
        if (operation === "create" || operation === "createMany") {
          const data = Array.isArray(args.data) ? args.data : [args.data ?? {}];
          for (const item of data) {
            if ((model === "userSalesMarket" && tables[model]!.some((r) => r.userId === item.userId && r.marketCode === item.marketCode)) || (model === "priceBookGrant" && tables[model]!.some(r => r.userId === item.userId && r.bookId === item.bookId))) continue;
            tables[model]!.push({ id: `${model}-${tables[model]!.length}`, createdAt: now, updatedAt: now, ...item });
          }
          return operation === "createMany" ? { count: data.length } : project(enrich(model, tables[model]!.at(-1)!), args);
        }
        if (operation === "update" || operation === "updateMany") {
          for (const row of rows) Object.assign(find(model, row.id)!, args.data);
          return operation === "updateMany" ? { count: rows.length } : rows[0] ? project(enrich(model, find(model, rows[0].id)!), args) : null;
        }
        if (operation === "delete" || operation === "deleteMany") { tables[model] = tables[model]!.filter((r) => !matches(enrich(model, r), args.where)); return operation === "deleteMany" ? { count: rows.length } : rows[0]; }
        return {};
      };
    }
  }
  for (const [model, methods] of Object.entries(raw)) {
    const delegate = Reflect.get(prisma, model) as object;
    for (const [operation, implementation] of Object.entries(methods)) {
      const original = Reflect.get(delegate, operation);
      Reflect.set(delegate, operation, implementation);
      t.after(() => { Reflect.set(delegate, operation, original); });
    }
  }
  const originalTransaction = prisma.$transaction;
  const transaction = async (fn: (tx: object) => Promise<unknown>) => {
    const saved = structuredClone(tables);
    try { return await fn({ ...raw, $queryRaw: async () => [{ id: "fixture" }] }); }
    catch (error) { for (const [model, rows] of Object.entries(saved)) tables[model] = rows; throw error; }
  };
  Reflect.set(prisma, "$transaction", transaction);
  t.after(() => { Reflect.set(prisma, "$transaction", originalTransaction); });
  return { tables, calls, setOutage: (v: boolean) => { outage = v; }, setAuditOutage: (v: boolean) => { auditOutage = v; } };
}
