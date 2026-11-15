import { PERMISSION_KEYS, createPricingEstimateSchema, pricingEstimateListQuerySchema, type CreatePricingEstimateInput, type PricingEstimateListQuery } from "@nbs/shared";
import type { Prisma, PricingEstimate } from "../generated/prisma/client";
import { prisma } from "../lib/prisma";
import { marketContext } from "../lib/market-context";
import { marketStorage } from "../lib/market-access";
import { conflict, forbidden, notFound } from "../lib/errors";
import { writeAuditLog } from "./audit.service";
import { calculateSavedSelection } from "../pricing/registry";

import { assertPriceBookAccess, ensureNativePricing, requireLegacyPricing } from "../lib/price-book-access";
import { publishedPriceBook, calculateNativePriceBook } from "../pricing/price-books";
import { pricingRates, convertPricingEstimate } from "./pricing-currency.service";

const serialize = (row: PricingEstimate) => ({ id: row.id, createdById: row.createdById, companyId: row.companyId,
  title: row.title, notes: row.notes, currency: row.currency, catalogVersion: row.catalogVersion,
  calculationVersion: row.calculationVersion, configurationVersion: row.configurationVersion,
  selection: row.selection, result: row.result, createdAt: row.createdAt.toISOString() });
async function estimateStorage<T>(work: () => Promise<T>) {
  try { return await marketStorage(work); }
  catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2034") throw conflict("The record changed concurrently. Retry saving the estimate.");
    if (error && typeof error === "object" && "code" in error && (error.code === "P2003" || error.code === "P2002")) throw conflict("A linked record changed concurrently. Retry saving the estimate.");
    throw error;
  }
}
async function prepare(input: CreatePricingEstimateInput) {
  const actor = marketContext.getStore()?.actor();
  if (!actor?.permissions.includes(PERMISSION_KEYS.PRICING_VIEW) || !actor.permissions.includes(PERMISSION_KEYS.PRICING_ESTIMATES_CREATE)) throw forbidden("Pricing save permission is required.");
  if (input.priceBook) {
    ensureNativePricing(); await assertPriceBookAccess(prisma, actor, input.priceBook.id);
    const result = calculateNativePriceBook(input.configuration, publishedPriceBook(input.priceBook.id, input.priceBook.version));
    const selection = { ...input.configuration, catalogVersion: result.catalogVersion, modules: [...input.configuration.modules].sort(), addons: [...input.configuration.addons].sort(), customModuleTier: [...input.configuration.customModuleTier].sort() };
    return { selection, calculationVersion: result.calculationVersion, result };
  }
  requireLegacyPricing();
  const calculated = calculateSavedSelection(input.configuration);
  const exchange = await pricingRates.get(input.displayCurrency ?? "JOD");
  return { ...calculated, result: { ...calculated.result, conversion: { exchange, result: convertPricingEstimate(calculated.result, exchange) } } };
}
async function insert(tx: Prisma.TransactionClient, input: CreatePricingEstimateInput, calculated: Awaited<ReturnType<typeof prepare>>) {
  const actor = marketContext.getStore()?.actor(); if (!actor) throw forbidden();
  const row = await tx.pricingEstimate.create({ data: {
    createdById: actor.id, companyId: input.companyId, title: input.title, notes: input.notes,
    currency: calculated.result.currency, catalogVersion: calculated.selection.catalogVersion,
    configurationVersion: calculated.selection.configurationVersion, calculationVersion: calculated.calculationVersion,
    selection: calculated.selection, result: calculated.result,
  } });
  if (input.priceBook) await tx.pricingEstimateBook.create({ data: { estimateId: row.id, bookId: input.priceBook.id, bookVersion: input.priceBook.version, structureVersion: input.priceBook.structureVersion } });
  return serialize(row);
}
export async function createPricingEstimate(raw: unknown) {
  const input = createPricingEstimateSchema.parse(raw);
  const calculated = await prepare(input);
  return estimateStorage(() => prisma.$transaction(tx => insert(tx, input, calculated), { isolationLevel: "Serializable" }));
}
export async function copyPricingEstimate(id: string, raw: unknown) {
  // Complete, explicit replacement input. No inherited company/notes or silent repricing.
  const input = createPricingEstimateSchema.parse(raw);
  const calculated = await prepare(input);
  return estimateStorage(() => prisma.$transaction(async tx => {
    const source = await tx.pricingEstimate.findUnique({ where: { id } });
    if (!source) throw notFound("Pricing estimate not found.");
    return insert(tx, input, calculated);
  }, { isolationLevel: "Serializable" }));
}
export async function getPricingEstimate(id: string) {
  return estimateStorage(async () => {
    const row = await prisma.pricingEstimate.findUnique({ where: { id } });
    if (!row) throw notFound("Pricing estimate not found.");
    return serialize(row); // Historical snapshot only; never call the current calculator here.
  });
}
export async function listPricingEstimates(raw: PricingEstimateListQuery) {
  const query = pricingEstimateListQuerySchema.parse(raw);
  const where: Prisma.PricingEstimateWhereInput = {
    ...(query.search ? { title: { contains: query.search, mode: "insensitive" } } : {}),
    ...(query.createdById ? { createdById: query.createdById } : {}),
    ...(query.companyId ? { companyId: query.companyId } : {}),
    ...(query.scope === "standalone" ? { companyId: null } : query.scope === "linked" ? { companyId: { not: null } } : {}),
  };
  if (query.companyId && query.scope === "standalone") where.AND = [{ companyId: query.companyId }, { companyId: null }];
  if (query.companyId && query.scope === "linked") where.companyId = query.companyId;
  return estimateStorage(() => prisma.$transaction(async tx => {
    const [items, total] = await Promise.all([
      tx.pricingEstimate.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      tx.pricingEstimate.count({ where }),
    ]);
    return { items: items.map(serialize), total, page: query.page, pageSize: query.pageSize };
  }, { isolationLevel: "RepeatableRead" }));
}

// Archiving changes visibility only; snapshots and their immutable bindings are untouched.
export async function archivePricingEstimate(id: string) {
  const actor = marketContext.getStore()?.actor();
  if (!actor?.permissions.includes(PERMISSION_KEYS.PRICING_VIEW) || !actor.permissions.includes(PERMISSION_KEYS.PRICING_ESTIMATES_CREATE)) throw forbidden();
  return estimateStorage(() => prisma.$transaction(async tx => {
    const row = await tx.pricingEstimate.findFirst({ where: { id, createdById: actor.id } });
    if (!row) throw notFound("Pricing estimate not found.");
    await tx.pricingEstimateArchive.create({ data: { estimateId: id, archivedById: actor.id } });
    await writeAuditLog({ actorUserId: actor.id, action: "PRICING_ESTIMATE_ARCHIVED", entityType: "PRICING_ESTIMATE", entityId: id, entityLabel: row.title, metadata: { archived: true, historicalSnapshotPreserved: true } }, tx);
    return { id, archived: true };
  }, { isolationLevel: "Serializable" }));
}
