import { priceBookReferenceSchema, priceBookIdSchema, PERMISSION_KEYS, SYSTEM_ROLE_NAMES, type AuthUser } from "@nbs/shared";
import type { Prisma } from "../generated/prisma/client";
import { env } from "../env";
import { AppError, badRequest, conflict, forbidden, notFound } from "./errors";
import { marketContext } from "./market-context";

import { assertPriceBookAccess, loadPriceBookAccess, canManagePriceBooks, ensureNativePricing, type PriceBookDb } from "./price-book-access";
import { publishedPriceBook } from "../pricing/price-books";

type Obj = Record<string, unknown>;
type Db = Record<string, { [operation: string]: (args?: Obj) => Promise<unknown> }>;
const obj = (value: unknown): Obj => value && typeof value === "object" && !Array.isArray(value) ? value as Obj : {};
const reads = new Set(["findUnique", "findUniqueOrThrow", "findFirst", "findFirstOrThrow", "findMany", "count", "aggregate", "groupBy"]);
const writes = new Set(["create", "createMany", "createManyAndReturn", "update", "updateMany", "updateManyAndReturn", "delete", "deleteMany", "upsert"]);
const models = new Set(["company", "contact", "opportunity", "activity", "task", "researchEvidence", "hypothesis", "salesMarket", "ownershipRequest", "notification", "auditLog"]);
const relationModels: Record<string, Record<string, [string, boolean]>> = {
  company: { salesMarket: ["salesMarket", false], contacts: ["contact", true], evidence: ["researchEvidence", true], hypotheses: ["hypothesis", true], opportunities: ["opportunity", true], activities: ["activity", true], tasks: ["task", true], owner: ["user", false] },
  contact: { company: ["company", false], opportunities: ["opportunity", true], activities: ["activity", true], tasks: ["task", true] },
  opportunity: { company: ["company", false], primaryContact: ["contact", false], activities: ["activity", true], tasks: ["task", true] },
  activity: { company: ["company", false], contact: ["contact", false], opportunity: ["opportunity", false] },
  task: { company: ["company", false], contact: ["contact", false], opportunity: ["opportunity", false] },
  researchEvidence: { company: ["company", false] }, hypothesis: { company: ["company", false] },
  user: { ownedCompanies: ["company", true], ownedOpportunities: ["opportunity", true], commissionOpportunities: ["opportunity", true], ownedTasks: ["task", true], ownedActivities: ["activity", true] },
};
export function isGlobalMarketAdmin(actor: Pick<AuthUser, "role">): boolean {
  return actor.role.isSystem && actor.role.name === SYSTEM_ROLE_NAMES.ADMIN;
}
// No nested estimate relations/counts/filters/writes through company or user APIs.
function rejectEstimateRelations(value: unknown): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) { value.forEach(rejectEstimateRelations); return; }
  for (const [key, nested] of Object.entries(value)) {
    if (["archive", "archivedPricingEstimates", "priceBookSnapshot", "priceBookGrants", "assignedPriceBookGrants", "pricingPreference", "defaultGrant"].includes(key)) throw forbidden("Use the authorized price-book API.");
    if (key === "pricingEstimates") throw forbidden("Use the authorized pricing estimates API.");
    if (key === "_count" && nested === true) throw forbidden("Use explicit relation counts.");
    rejectEstimateRelations(nested);
  }
}
async function estimateScope(db: Db, actor: AuthUser): Promise<Obj> {
  const creator = { archive: { is: null }, ...(actor.permissions.includes(PERMISSION_KEYS.PRICING_ESTIMATES_VIEW_ALL) ? {} : { createdById: actor.id }) };
  let bookScope:Obj = {};
  if (env.PRICING_MODE === "price_books") { const access=await loadPriceBookAccess(db as unknown as PriceBookDb,actor); bookScope={OR:[{priceBookSnapshot:{is:{bookId:{in:access.bookIds}}}},...(access.bookIds.includes("JO")?[{priceBookSnapshot:{is:null}}]:[])]}; }
  if (!actor.permissions.includes(PERMISSION_KEYS.COMPANIES_VIEW)) return { AND: [creator, { companyId: null }, bookScope] };
  const company = isGlobalMarketAdmin(actor) ? {} : companyMarketWhere(await assignedMarketCodes(db));
  return { AND: [creator, { OR: [{ companyId: null }, { company }] }, bookScope] };
}
async function estimateOperation(db: Db, delegate: object, method: string, original: (...args: unknown[]) => unknown, input?: Obj) {
  const actor = actorRequired();
  if (!actor.permissions.includes(PERMISSION_KEYS.PRICING_VIEW)) throw forbidden();
  rejectEstimateRelations(input);
  if (input?.include) throw forbidden("Estimate relation projections are not available.");
  if (input?.select && Object.values(obj(input.select)).some(value => typeof value !== "boolean")) throw forbidden("Only scalar estimate projections are available.");
  if (input?.select && ["company", "createdBy"].some(key => key in obj(input.select))) throw forbidden("Estimate relation projections are not available.");
  if (reads.has(method)) return Reflect.apply(original, delegate, [{ ...input, where: andWhere(input?.where, await estimateScope(db, actor)) }]);
  if (method !== "create") throw forbidden("Pricing estimates are immutable; create a new copy.");
  if (!actor.permissions.includes(PERMISSION_KEYS.PRICING_ESTIMATES_CREATE)) throw forbidden();
  const data = obj(input?.data);
  const snapshot=obj(data.result);
  if (snapshot.pricingBasis === "PRICE_BOOK") { ensureNativePricing(); const bookMetadata=obj(snapshot.priceBook); const reference=priceBookReferenceSchema.parse({id:bookMetadata.id,version:bookMetadata.version,structureVersion:bookMetadata.structureVersion}); await assertPriceBookAccess(db as unknown as PriceBookDb,actor,reference.id); const book=publishedPriceBook(reference.id,reference.version); if(bookMetadata.internalOnly!==true || bookMetadata.publiclyApproved!==false || bookMetadata.reviewStatus!==book.reviewStatus || data.currency!==book.currency || data.catalogVersion!==book.version) throw badRequest("Native price-book snapshot metadata mismatch."); }
  else if (env.PRICING_MODE === "price_books") throw badRequest("Use an authorized native price book for new estimates.");
  const allowed = new Set(["createdById", "companyId", "title", "notes", "currency", "catalogVersion", "calculationVersion", "configurationVersion", "selection", "result"]);
  if (data.createdById !== actor.id || Object.keys(data).some(key => !allowed.has(key))) throw forbidden("Estimate creator and snapshots are server controlled.");
  if (data.companyId !== null && data.companyId !== undefined) {
    if (!actor.permissions.includes(PERMISSION_KEYS.COMPANIES_VIEW)) throw notFound("Company not found.");
    const company = isGlobalMarketAdmin(actor) ? {} : companyMarketWhere(await assignedMarketCodes(db));
    if (typeof data.companyId !== "string" || !await db.company!.findFirst!({ where: andWhere({ id: data.companyId }, company), select: { id: true } })) throw notFound("Company not found.");
  }
  return Reflect.apply(original, delegate, [input]);
}
function actorRequired(): AuthUser {
  const actor = marketContext.getStore()?.actor();
  if (!actor) throw forbidden("Authenticated market context is required.");
  return actor;
}
export async function assignedMarketCodes(db: object): Promise<string[]> {
  const context = marketContext.getStore();
  const actor = actorRequired();
  if (!context!.codes) context!.codes = (async () => {
    try {
      const rows = await (db as Db).userSalesMarket!.findMany!({ where: { userId: actor.id }, select: { marketCode: true } }) as Array<{ marketCode: string }>;
      return rows.map((row) => row.marketCode);
    } catch { throw new AppError(503, "SERVICE_UNAVAILABLE", "Market authorization is temporarily unavailable."); }
  })();
  return context!.codes;
}
export async function marketStorage<T>(work: () => Promise<T>): Promise<T> {
  try { return await work(); }
  catch (error) {
    if (["P1001", "P1002", "P1008", "P1017", "P2021", "P2022", "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT"].includes(String(obj(error).code))) {
      throw new AppError(503, "SERVICE_UNAVAILABLE", "CRM market data is temporarily unavailable.");
    }
    throw error;
  }
}
export function companyMarketWhere(codes: string[]): Obj { return { salesMarketCode: { in: codes } }; }
export function recordMarketWhere(model: string, codes: string[]): Obj | undefined {
  const company = companyMarketWhere(codes);
  if (model === "company") return company;
  if (model === "salesMarket") return { code: { in: codes } };
  if (["contact", "researchEvidence", "hypothesis"].includes(model)) return { company };
  if (model === "opportunity") return { AND: [{ company }, { OR: [{ primaryContactId: null }, { primaryContact: { company } }] }] };
  if (model === "activity" || model === "task") {
    const references = [{ company }, { contact: { company } }, { opportunity: recordMarketWhere("opportunity", codes) }];
    return { AND: [
      { OR: references },
      model === "activity" ? references[0]! : { OR: [{ companyId: null }, references[0]!] },
      { OR: [{ contactId: null }, references[1]!] },
      { OR: [{ opportunityId: null }, references[2]!] },
    ] };
  }
  return undefined;
}
function andWhere(where: unknown, scope: Obj): Obj {
  const previous = obj(where);
  const conditions = Array.isArray(previous.AND) ? previous.AND : previous.AND ? [previous.AND] : [];
  return { ...previous, AND: [...conditions, scope] };
}
const entityModels: Record<string, string> = { COMPANY: "company", CONTACT: "contact", OPPORTUNITY: "opportunity", TASK: "task", ACTIVITY: "activity", EVIDENCE: "researchEvidence", HYPOTHESIS: "hypothesis" };
async function scopeFor(db: Db, model: string, codes: string[]): Promise<Obj | undefined> {
  const basic = recordMarketWhere(model, codes);
  if (basic) return basic;
  if (model === "auditLog") return { id: { in: [] } }; // JSON payloads can contain other-market labels.
  if (model === "notification" || model === "ownershipRequest") {
    const OR: Obj[] = [];
    for (const [entityType, related] of Object.entries(entityModels)) {
      if (model === "ownershipRequest" && !["COMPANY", "OPPORTUNITY", "TASK"].includes(entityType)) continue;
      const rows = await db[related]!.findMany!({ where: recordMarketWhere(related, codes), select: { id: true } }) as Array<{ id: string }>;
      OR.push({ entityType, entityId: { in: rows.map((row) => row.id) } });
    }
    return { OR };
  }
  return undefined;
}
async function scopeProjection(db: Db, model: string, args: Obj, codes: string[]): Promise<Obj> {
  const result = { ...args };
  for (const key of ["select", "include"]) {
    if (!args[key]) continue;
    const projection = { ...obj(args[key]) };
    for (const [name, value] of Object.entries(projection)) {
      if (!value) continue;
      if (name === "_count") {
        const count = value === true ? Object.fromEntries(Object.entries(relationModels[model] ?? {}).filter(([, [, many]]) => many).map(([relation]) => [relation, true])) : obj(obj(value).select);
        const select: Obj = { ...count };
        for (const [relation, selection] of Object.entries(select)) {
          const target = relationModels[model]?.[relation];
          if (target?.[1] && selection) select[relation] = { ...obj(selection), where: andWhere(obj(selection).where, (await scopeFor(db, target[0], codes)) ?? {}) };
        }
        projection[name] = { select };
        continue;
      }
      const target = relationModels[model]?.[name];
      if (!target) continue;
      let nested = await scopeProjection(db, target[0], value === true ? {} : obj(value), codes);
      if (target[1]) nested = { ...nested, where: andWhere(nested.where, (await scopeFor(db, target[0], codes)) ?? {}) };
      projection[name] = Object.keys(nested).length ? nested : value;
    }
    result[key] = projection;
  }
  return result;
}
async function eligibleOwner(db: Db, userId: unknown, market: string | null) {
  if (userId == null) return;
  if (typeof userId !== "string") throw badRequest("Owner must be an eligible active user.");
  const user = await db.user!.findUnique!({ where: { id: userId }, include: { role: true, marketMemberships: { select: { marketCode: true } } } }) as { isActive: boolean; role: AuthUser["role"]; marketMemberships: Array<{ marketCode: string }> } | null;
  if (!user?.isActive || (!isGlobalMarketAdmin(user) && (!market || !user.marketMemberships.some((entry) => entry.marketCode === market)))) throw badRequest("Owner/assignee is not eligible for this market.");
}
async function guardDelete(db: Db, model: string, args: Obj, codes: string[]) {
  if (!["company", "contact", "opportunity"].includes(model)) return;
  const rows = await db[model]!.findMany!({ where: args.where, select: { id: true } }) as Array<{ id: string }>;
  for (const row of rows) {
    const contacts = model === "company" ? await db.contact!.findMany!({ where: { companyId: row.id }, select: { id: true } }) as Array<{ id: string }> : [];
    for (const dependent of ["activity", "task", "opportunity"]) {
      const OR: Obj[] = [];
      if (model === "company") {
        OR.push({ companyId: row.id });
        OR.push({ [dependent === "opportunity" ? "primaryContactId" : "contactId"]: { in: contacts.map((contact) => contact.id) } });
      } else if (model === "contact") OR.push({ [dependent === "opportunity" ? "primaryContactId" : "contactId"]: row.id });
      else if (dependent !== "opportunity") OR.push({ opportunityId: row.id });
      if (!OR.length) continue;
      const hidden = await db[dependent]!.count!({ where: { AND: [{ OR }, { NOT: recordMarketWhere(dependent, codes) }] } });
      if (Number(hidden) > 0) throw conflict("Linked CRM records prevent deletion. An administrator must review the relationships.");
    }
  }
}
async function guardWrite(db: Db, model: string, operation: string, args: Obj, codes: string[] | undefined) {
  if (["auditLog", "notification"].includes(model)) return;
  if (operation === "delete" || operation === "deleteMany") {
    if (model === "company") {
      const rows = await db.company!.findMany!({ where: args.where, select: { id: true } }) as Array<{ id: string }>;
      if (rows.length && await db.pricingEstimate!.count!({ where: { companyId: { in: rows.map(row => row.id) } } })) throw conflict("Linked historical CRM records prevent company deletion.");
    }
    if (codes) await guardDelete(db, model, args, codes);
    return;
  }
  if (operation === "upsert") throw forbidden("Business upserts require an explicitly reviewed authorization path.");
  const items = Array.isArray(args.data) ? args.data : [args.data];
  for (const item of items) {
    const data = obj(item);
    if (Object.keys(data).some((key) => key === "countryMarketLegacyCohort" || key in (relationModels[model] ?? {}) || ["owner", "commissionRepresentative", "market", "memberships", "createdBy"].includes(key))) throw forbidden("Nested relationship writes and legacy-cohort changes are not allowed through CRM writes.");
    if (model === "salesMarket") throw forbidden("Market reference changes require an approved provisioning operation.");
    if (model === "ownershipRequest") {
      if (operation === "create") {
        const target = entityModels[String(data.entityType)];
        const row = target ? await db[target]!.findFirst!({ where: andWhere({ id: data.entityId }, codes ? (await scopeFor(db, target, codes)) ?? {} : {}) }) : null;
        if (!row) throw notFound("Record not found.");
      }
      continue;
    }
    const links = ["companyId", "contactId", "primaryContactId", "opportunityId"];
    const changed = operation.startsWith("create") || links.some((key) => key in data) || "salesMarketCode" in data || "ownerId" in data || "commissionRepresentativeId" in data;
    if (!changed) continue;
    const many = operation === "updateMany" || operation === "updateManyAndReturn";
    const existing = operation.startsWith("update") ? await db[model]!.findMany!({ where: args.where }) as Obj[] : [{}];
    if (many && existing.length === 0) continue;
    for (const old of existing) {
      const next = { ...old, ...data };
      let market: string | null = null;
      if (model === "company") market = typeof next.salesMarketCode === "string" ? next.salesMarketCode : null;
      const companyIds: string[] = [];
      if (typeof next.companyId === "string") companyIds.push(next.companyId);
      for (const [key, target] of [["contactId", "contact"], ["primaryContactId", "contact"], ["opportunityId", "opportunity"]]) {
        if (next[key!] == null) continue;
        const related = await db[target!]!.findFirst!({ where: andWhere({ id: next[key!] }, codes ? (await scopeFor(db, target!, codes)) ?? {} : {}) }) as Obj | null;
        if (!related || typeof related.companyId !== "string") throw notFound("Related record not found.");
        companyIds.push(related.companyId);
      }
      if (new Set(companyIds).size > 1) throw badRequest("Linked CRM records must belong to the same company.");
      if (model !== "company") {
        if (companyIds[0]) {
          const company = await db.company!.findFirst!({ where: andWhere({ id: companyIds[0] }, codes ? companyMarketWhere(codes) : {}) }) as Obj | null;
          if (!company) throw notFound("Company not found.");
          market = typeof company.salesMarketCode === "string" ? company.salesMarketCode : null;
        } else if (codes) throw forbidden("A market-scoped company relationship is required.");
      }
      if (model === "company" && operation.startsWith("update") && "salesMarketCode" in data && old.salesMarketCode !== market) {
        if (codes) throw forbidden("Only system Admins may change a company sales market.");
        for (const relatedModel of ["opportunity", "task", "activity"]) {
          const relatedWhere = relatedModel === "task" ? { OR: [{ companyId: old.id }, { contact: { companyId: old.id } }, { opportunity: { companyId: old.id } }] } : { companyId: old.id };
          const relatedOwners = await db[relatedModel]!.findMany!({ where: relatedWhere, select: { ownerId: true } }) as Array<{ ownerId: string | null }>;
          for (const related of relatedOwners) await eligibleOwner(db, related.ownerId, market);
        }
      }
      if (["contact", "opportunity"].includes(model) && old.id && "companyId" in data && old.companyId !== next.companyId) {
        for (const dependent of ["task", "activity", ...(model === "contact" ? ["opportunity"] : [])]) {
          const key = model === "opportunity" ? "opportunityId" : dependent === "opportunity" ? "primaryContactId" : "contactId";
          if (await db[dependent]!.count!({ where: { [key]: old.id } })) throw conflict("Linked records cannot be moved to another company without a reviewed reconciliation.");
        }
      }
      if (codes && (!market || !codes.includes(market))) throw forbidden("Market access denied.");
      const ownerChanged = "ownerId" in data && data.ownerId !== old.ownerId;
      const parentChanged = links.some((key) => key in data && data[key] !== old[key]);
      const marketChanged = "salesMarketCode" in data && data.salesMarketCode !== old.salesMarketCode;
      if (operation.startsWith("create") || ownerChanged || parentChanged || marketChanged) await eligibleOwner(db, next.ownerId, market);
      if ("commissionRepresentativeId" in data && data.commissionRepresentativeId !== old.commissionRepresentativeId) await eligibleOwner(db, data.commissionRepresentativeId, market);
      if (model === "company" && operation.startsWith("create")) {
        const OR: Obj[] = [{ nameNormalized: next.nameNormalized }];
        if (next.websiteDomain) OR.push({ websiteDomain: next.websiteDomain });
        if (await db.company!.findFirst!({ where: { OR }, select: { id: true } })) throw conflict("Company cannot be created with these identifiers.");
      }
    }
  }
}
// All existing services, aggregates, lookups and transaction delegates share this boundary.
// The raw client stays private to lib/prisma.ts; no service imports an unscoped client.
export function protectMarketClient<T extends object>(client: T, inTransaction = false): T {
  const delegates = new Map<string, object>();
  return new Proxy(client, {
    get(target, key, receiver) {
      const value = Reflect.get(target, key, receiver);
      if (key === "$transaction" && typeof value === "function") return (callback: unknown, options?: unknown) => {
        if (typeof callback !== "function") throw forbidden("Use an interactive transaction for market-authorized operations.");
        return Reflect.apply(value, target, [(tx: object) => callback(protectMarketClient(tx, true)), options]);
      };
      if (key === "priceBookGrant" || key === "userPricingPreference" || key === "pricingEstimateBook") {
        if(!delegates.has(key)) delegates.set(key,new Proxy(value as object,{get(delegate,method){const original=Reflect.get(delegate,method);if(typeof method!=="string"||typeof original!=="function")return original;return async(input?:Obj)=>marketStorage(async()=>{
          const actor=actorRequired();rejectEstimateRelations(input);
          const scalarFields = new Set(key === "priceBookGrant" ? ["userId", "bookId", "assignedByUserId", "assignedAt"] : key === "userPricingPreference" ? ["userId", "defaultBookId"] : ["estimateId", "bookId", "bookVersion", "structureVersion"]);
          if (input?.include || input?.select && Object.entries(obj(input.select)).some(([field, selection]) => !scalarFields.has(field) || typeof selection !== "boolean")) throw forbidden("Only scalar price-book projections are available.");
          const dataRows = Array.isArray(input?.data) ? input.data : input?.data ? [input.data] : [];
          if (dataRows.some(row => Object.keys(obj(row)).some(field => !scalarFields.has(field)))) throw forbidden("Nested price-book access mutations are not allowed.");
          if(key==="pricingEstimateBook") {
            if(method!=="create"||!inTransaction)throw forbidden("Use the authorized immutable estimates API.");
            ensureNativePricing(); if(!actor.permissions.includes(PERMISSION_KEYS.PRICING_ESTIMATES_CREATE))throw forbidden();
            const data=obj(input?.data);const id=priceBookIdSchema.parse(data.bookId);await assertPriceBookAccess(target as unknown as PriceBookDb,actor,id);publishedPriceBook(id,String(data.bookVersion));
            const estimate=await (target as Db).pricingEstimate!.findUnique!({where:{id:data.estimateId}}) as Obj|null;
            const metadata=obj(obj(estimate?.result).priceBook);
            if(!estimate||estimate.createdById!==actor.id||metadata.id!==id||metadata.version!==data.bookVersion||metadata.structureVersion!==data.structureVersion)throw forbidden("Snapshot binding mismatch.");
            return Reflect.apply(original,delegate,[input]);
          }
          if(writes.has(method)) {if(!inTransaction||!canManagePriceBooks(actor))throw forbidden("System Admin and explicit price-book management permission are required.");return Reflect.apply(original,delegate,[input]);}
          if(!reads.has(method))throw forbidden();
          if(!canManagePriceBooks(actor)&&!actor.permissions.includes(PERMISSION_KEYS.PRICING_VIEW))throw forbidden();
          return Reflect.apply(original,delegate,[{...input,where:canManagePriceBooks(actor)?input?.where:andWhere(input?.where,{userId:actor.id})}]);
        });}}));return delegates.get(key);
      }
      if (key === "pricingEstimateArchive") {
        if (!delegates.has(key)) delegates.set(key, new Proxy(value as object, { get(delegate, method) {
          const original = Reflect.get(delegate, method);
          if (typeof method !== "string" || typeof original !== "function") return original;
          return async (input?: Obj) => marketStorage(async () => {
            const actor = actorRequired();
            if (!inTransaction || method !== "create" || !actor.permissions.includes(PERMISSION_KEYS.PRICING_VIEW) || !actor.permissions.includes(PERMISSION_KEYS.PRICING_ESTIMATES_CREATE)) throw forbidden("Use the authorized archive API.");
            const data = obj(input?.data);
            if (input?.include || input?.select || Object.keys(data).some(field => !["estimateId", "archivedById"].includes(field)) || data.archivedById !== actor.id) throw forbidden();
            const estimate = await (target as Db).pricingEstimate!.findFirst!({ where: andWhere({ id: data.estimateId, createdById: actor.id }, await estimateScope(target as Db, actor)), select: { id: true } });
            if (!estimate) throw notFound("Pricing estimate not found.");
            return Reflect.apply(original, delegate, [input]);
          });
        } }));
        return delegates.get(key);
      }
      if (key === "pricingEstimate") {
        if (!delegates.has(key)) delegates.set(key, new Proxy(value as object, {
          get(delegate, method) {
            const original = Reflect.get(delegate, method);
            if (typeof method !== "string" || typeof original !== "function") return original;
            return async (input?: Obj) => marketStorage(() => {
              if (method === "create" && !inTransaction) throw forbidden("Use a transaction to save pricing estimates.");
              return estimateOperation(target as Db, delegate, method, original, input);
            });
          },
        }));
        return delegates.get(key);
      }
      if (key === "user" || key === "userSalesMarket") {
        if (!delegates.has(key)) delegates.set(key, new Proxy(value as object, {
          get(delegate, method) {
            const original = Reflect.get(delegate, method);
            if (typeof method !== "string" || typeof original !== "function") return original;
            return async (input?: Obj) => {
              rejectEstimateRelations(input);
              const actor = marketContext.getStore()?.actor();
              if (env.MARKET_ACCESS_MODE === "enforced" && actor && !marketContext.getStore()?.maintenance && !isGlobalMarketAdmin(actor)) {
                if (key === "userSalesMarket") {
                  if (writes.has(method)) throw forbidden("Only system Admins can assign sales markets.");
                  return Reflect.apply(original, delegate, [{ ...input, where: andWhere(input?.where, { userId: actor.id }) }]);
                }
                if (writes.has(method)) {
                  const data = obj(input?.data);
                  if (data.role || data.marketMemberships || data.defaultMarketCode !== undefined || data.defaultMarket || data.accountType !== undefined) throw forbidden("Nested access changes are not allowed.");
                  const db = target as Db;
                  const existing = input?.where ? await db.user!.findUnique!({ where: input.where, include: { role: true } }) as { role: AuthUser["role"] } | null : null;
                  const role = typeof data.roleId === "string" ? await db.role!.findUnique!({ where: { id: data.roleId } }) as AuthUser["role"] | null : null;
                  if ((existing && isGlobalMarketAdmin(existing)) || (role && isGlobalMarketAdmin({ role }))) throw forbidden("Only system Admins can modify or assign global Admin accounts.");
                }
                if (Object.keys({ ...obj(input?.include), ...obj(input?.select) }).some((relation) => relation === "_count" || relation in relationModels.user!)) {
                  const codes = await assignedMarketCodes(target);
                  return Reflect.apply(original, delegate, [await scopeProjection(target as Db, "user", { ...input }, codes)]);
                }
              }
              return Reflect.apply(original, delegate, [input]);
            };
          },
        }));
        return delegates.get(key);
      }
      if (typeof key !== "string" || !models.has(key)) return typeof value === "function" ? value.bind(target) : value;
      if (!delegates.has(key)) delegates.set(key, new Proxy(value as object, {
        get(delegate, method) {
          const original = Reflect.get(delegate, method);
          if (typeof method !== "string" || typeof original !== "function") return original;
          return async (input?: Obj) => marketStorage(async () => {
            rejectEstimateRelations(input);
            if (env.MARKET_ACCESS_MODE === "legacy" || marketContext.getStore()?.maintenance) {
              if (key === "company" && method.startsWith("delete")) await guardWrite(target as Db, key, method, { ...input }, undefined);
              try { return await Reflect.apply(original, delegate, [input]); }
              catch (error) {
                if (key === "company" && method.startsWith("delete") && obj(error).code === "P2003") throw conflict("Linked historical CRM records prevent company deletion.");
                throw error;
              }
            }
            // Sign-in writes audit events before an authenticated actor exists; do not alter auth.
            if (key === "auditLog" && (method === "create" || method === "createMany")) return Reflect.apply(original, delegate, [input]);
            const actor = actorRequired();
            if (writes.has(method) && !inTransaction) {
              const transaction = Reflect.get(target, "$transaction");
              if (typeof transaction !== "function") throw forbidden("An authorized transaction is required.");
              try {
                return await Reflect.apply(transaction, target, [async (tx: object) => {
                  const protectedTx = protectMarketClient(tx, true);
                  const methodFn = Reflect.get(Reflect.get(protectedTx, key) as object, method);
                  return Reflect.apply(methodFn, Reflect.get(protectedTx, key), [input]);
                }, { isolationLevel: "Serializable" }]);
              } catch (error) {
                if (obj(error).code === "P2034") throw conflict("The record changed concurrently. Retry the operation.");
                if (obj(error).code === "P2025") throw notFound("Record not found.");
                throw error;
              }
            }
            const codes = isGlobalMarketAdmin(actor) ? undefined : await assignedMarketCodes(target);
            let args = { ...input };
            if (codes) {
              const scope = await scopeFor(target as Db, key, codes);
              if (scope && (reads.has(method) || method.startsWith("update") || method.startsWith("delete"))) args.where = andWhere(args.where, scope);
              args = await scopeProjection(target as Db, key, args, codes);
            }
            if (writes.has(method)) await guardWrite(target as Db, key, method, args, codes);
            else if (!reads.has(method)) throw forbidden("Unsupported market operation.");
            try { return await Reflect.apply(original, delegate, [args]); }
            catch (error) {
              if (key === "company" && method.startsWith("delete") && obj(error).code === "P2003") throw conflict("Linked historical CRM records prevent company deletion.");
              throw error;
            }
          });
        },
      }));
      return delegates.get(key);
    },
  });
}

export async function marketUserOptionsWhere(db: object): Promise<Obj> {
  const actor = marketContext.getStore()?.actor();
  if (env.MARKET_ACCESS_MODE === "legacy" || marketContext.getStore()?.maintenance || (actor && isGlobalMarketAdmin(actor))) return {};
  const codes = await assignedMarketCodes(db);
  return { OR: [{ id: actorRequired().id }, { role: { name: SYSTEM_ROLE_NAMES.ADMIN, isSystem: true } }, { marketMemberships: { some: { marketCode: { in: codes } } } }] };
}

export async function assertMarketOwnerEligibility(db: object, userId: string, marketCode: string) {
  if (env.MARKET_ACCESS_MODE === "legacy" || marketContext.getStore()?.maintenance) return;
  await eligibleOwner(db as Db, userId, marketCode);
}

// Existing permission-based Admin-capability checks do not guarantee a global-market Admin.
export async function assertGlobalMarketAdminSurvives(
  tx: Prisma.TransactionClient,
  existing: { id: string; roleId: string; isActive: boolean; role: AuthUser["role"] },
  patch: { roleId?: string; isActive?: boolean },
) {
  if (env.MARKET_ACCESS_MODE === "legacy" || !existing.isActive || !isGlobalMarketAdmin(existing)) return;
  if (patch.isActive !== false && (!patch.roleId || patch.roleId === existing.roleId)) return;
  // Serialize concurrent demotions/deactivations; SELECT only, scoped to this transaction.
  await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(721006072)`;
  const remaining = await tx.user.count({ where: { id: { not: existing.id }, isActive: true, role: { name: SYSTEM_ROLE_NAMES.ADMIN, isSystem: true } } });
  if (!remaining) throw conflict("The last active system Admin must retain global market administration.");
}
