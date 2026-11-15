import { z } from "zod";
import { PRICE_BOOK_CURRENCIES, priceBookIdSchema, pricingCurrencySchema, pricingExchangeSchema, marketDisplayCurrency, type PricingCurrency, PERMISSION_KEYS as P, pricingCatalogResponseSchema, pricingRequestSchema, createPricingEstimateSchema, type AuthUser, type PricingRequest, type PricingCatalogResponse, type CreatePricingEstimateInput } from "@nbs/shared";
import type { QueryClient } from "@tanstack/react-query";
import { api, ApiError } from "./api";
import { toQuery } from "./query";

export type PricingCatalog = PricingCatalogResponse["data"];
// Transport shapes only: amounts arrive from the authorized API. No catalog prices/calculator.
const money = z.number().finite().nonnegative();
export const quoteSchema = z.discriminatedUnion("kind", [z.object({ kind: z.literal("exact"), amount: money }), z.object({ kind: z.literal("starting_from"), amount: money }), z.object({ kind: z.literal("per_session"), amount: money }), z.object({ kind: z.literal("custom_quotation") })]);
export type CatalogQuote = z.infer<typeof quoteSchema>;
const pricedItem = z.object({ id: z.string(), quote: quoteSchema });
export const pricingPricesSchema = z.object({ catalogVersion: z.string(), configurationVersion: z.number().int(), currency: pricingCurrencySchema,
  products: z.array(pricedItem.extend({ noteKey: z.string(), initialConfiguration: pricingRequestSchema, typicalQuote: quoteSchema.nullable() })), modules: z.array(pricedItem),
  presets: z.array(pricedItem.extend({ componentTotal: money, savings: money })), addons: z.array(pricedItem), customModuleTiers: z.array(pricedItem), customSoftwareTiers: z.array(pricedItem),
  exchange: pricingExchangeSchema.optional(),
  moduleGroups: z.array(z.object({ id: z.string(), ids: z.array(z.string()) })), addonGroups: z.array(z.object({ id: z.string(), ids: z.array(z.string()) })),
});
export type PricingPrices = z.infer<typeof pricingPricesSchema>;
const historicalBookSchema = z.object({ id: priceBookIdSchema, version: z.string().min(1).max(80), structureVersion: z.string().min(1).max(80), publiclyApproved:z.literal(false).optional(), internalOnly:z.literal(true).optional(),reviewStatus:z.enum(["internal_catalog","draft_v1"]).optional() });
export const estimateSnapshotSchema = z.object({ priceBook: historicalBookSchema.optional(), pricingBasis: z.literal("PRICE_BOOK").optional(), currency: pricingCurrencySchema, exchange: pricingExchangeSchema.optional(), catalogVersion: z.string(), configurationVersion: z.number().int(),
  estimatedTotal: money, componentOnlyTotal: money, bundleSavings: money, presetApplied: z.string().nullable(), hasStartingFromItems: z.boolean(), hasCustomQuotationItems: z.boolean(),
  lineItems: z.array(z.object({ id: z.string(), kind: z.enum(["module", "addon", "custom-module", "custom-software", "preset"]), quote: quoteSchema, amount: money, isEstimateFloor: z.boolean() })),
});
export type EstimateSnapshot = z.infer<typeof estimateSnapshotSchema>;
export const savedEstimateSchema = z.object({ id: z.string(), createdById: z.string(), companyId: z.string().nullable(), title: z.string(), notes: z.string(), currency: pricingCurrencySchema,
  catalogVersion: z.string(), calculationVersion: z.string(), configurationVersion: z.number().int(), selection: z.unknown(), result: z.unknown(), createdAt: z.string().datetime() });
export type SavedEstimate = z.infer<typeof savedEstimateSchema>;
export const canViewPricing = (user: AuthUser | null) => !!user?.permissions.includes(P.PRICING_VIEW);
export const canSavePricing = (user: AuthUser | null) => canViewPricing(user) && !!user?.permissions.includes(P.PRICING_ESTIMATES_CREATE);
export const canLinkPricing = (user: AuthUser | null) => canSavePricing(user) && !!user?.permissions.includes(P.COMPANIES_VIEW);
export const pricingActorKey = (user: AuthUser | null) => [user?.id ?? "", [...(user?.permissions ?? [])].sort().join(",")];
const denied = () => new ApiError(403, "FORBIDDEN", "Pricing permission is required.");
export function pricingErrorKey(error: unknown) {
  if (error instanceof ApiError) {
    if (error.code === "PRICE_BOOK_ROLLOUT_PENDING" || error.code === "PRICE_BOOK_STORAGE_UNAVAILABLE" || error.code === "PRICE_BOOK_REQUIRED" || error.code === "PRICE_BOOK_UNPUBLISHED") return "pricing.priceBookPending";
    if (error.failure === "network") return "pricing.network";
    if (error.code === "PRICING_ENDPOINT_MISSING") return "pricing.endpointMissing";
    if (error.status === 403) return "pricing.denied";
    if (error.status === 404) return "pricing.notFound";
    if (error.status === 400 || error.status === 409) return "pricing.invalid";
    if (error.code === "EXCHANGE_RATES_STALE" || error.code === "EXCHANGE_RATES_UNAVAILABLE") return "pricing.ratesUnavailable";
    if (error.status >= 500) return "pricing.unavailable";
  }
  return error instanceof z.ZodError ? "pricing.invalid" : "pricing.failed";
}
async function pricingEndpoint(path: string, body?: unknown) {
  try { return await (body === undefined ? api.get(path) : api.post(path, body)); }
  catch (error) { if (error instanceof ApiError && error.status === 404) throw new ApiError(404, "PRICING_ENDPOINT_MISSING", "The pricing service endpoint is unavailable."); throw error; }
}
export const pricingCatalogOptions = (user: AuthUser | null) => ({ queryKey: ["pricing", "catalog", ...pricingActorKey(user)], enabled: canViewPricing(user), retry: false,
  queryFn: async () => { if (!canViewPricing(user)) throw denied(); return pricingCatalogResponseSchema.parse({ data: await pricingEndpoint("/pricing/catalog") }).data; }, refetchOnWindowFocus: true });
export const pricingPricesOptions = (user: AuthUser | null, currency: PricingCurrency = "JOD") => ({ queryKey: ["pricing", "prices", "core-starts", ...pricingActorKey(user), currency], enabled: canViewPricing(user), retry: false,
  queryFn: async () => { if (!canViewPricing(user)) throw denied(); return pricingPricesSchema.parse(await pricingEndpoint(`/pricing/prices?currency=${currency}`)); }, refetchOnWindowFocus: false });
export function assertPricingVersions(catalog: PricingCatalog, prices: PricingPrices, currency: PricingCurrency = "JOD") {
  if (catalog.catalogVersion !== prices.catalogVersion || catalog.configurationVersion !== prices.configurationVersion || catalog.currency !== "JOD" || prices.currency !== currency) throw new ApiError(503, "CATALOG_MISMATCH", "Pricing versions do not match.");
  for (const kind of ["products", "modules", "presets", "addons", "customModuleTiers", "customSoftwareTiers"] as const) {
    const expected = catalog[kind].map(item => typeof item === "string" ? item : item.id);
    const actual = prices[kind].map(item => item.id);
    if (new Set(actual).size !== actual.length || expected.length !== actual.length || expected.some(id => !actual.includes(id))) throw new ApiError(503, "CATALOG_MISMATCH", "Pricing items do not match.");
  }
  if (prices.products.some(item => item.initialConfiguration.product !== item.id || item.initialConfiguration.catalogVersion !== catalog.catalogVersion || item.initialConfiguration.configurationVersion !== catalog.configurationVersion)) throw new ApiError(503, "CATALOG_MISMATCH", "Product starting configurations do not match.");
}
export function emptyPricingConfiguration(catalog: PricingCatalog, product: PricingRequest["product"]): PricingRequest {
  return { configurationVersion: catalog.configurationVersion, catalogVersion: catalog.catalogVersion, product,
    modules: catalog.modules.filter(m => m.product === product && m.required).map(m => m.id), addons: [], customModuleTier: [], customSoftwareTier: null, customNotes: "" };
}
// Interpret non-priced API dependency metadata; OR dependencies remain an explicit user choice.
export function togglePricingModule(catalog: PricingCatalog, modules: PricingRequest["modules"], id: PricingRequest["modules"][number], checked: boolean) {
  const chosen = new Set(modules); const item = catalog.modules.find(m => m.id === id); if (!item) return modules;
  if (checked) {
    const add = (key: typeof id) => { if (chosen.has(key)) return; chosen.add(key); catalog.modules.find(m => m.id === key)?.requires.forEach(add); }; add(id);
  } else {
    if (item.required) return modules; chosen.delete(id);
    let changed = true;
    while (changed) { changed = false; for (const item of catalog.modules) {
      if (chosen.has(item.id) && (item.requires.some(key => !chosen.has(key)) || (item.requiresAnyOf.length > 0 && !item.requiresAnyOf.some(key => chosen.has(key))))) { chosen.delete(item.id); changed = true; }
    } }
  }
  return [...chosen];
}
export function planPricingModuleChange(catalog: PricingCatalog, modules: PricingRequest["modules"], id: PricingRequest["modules"][number], checked: boolean) {
  const next = togglePricingModule(catalog, modules, id, checked);
  const alternatives = checked ? catalog.modules.filter(item => next.includes(item.id) && item.requiresAnyOf.length && !item.requiresAnyOf.some(key => next.includes(key))).flatMap(item => item.requiresAnyOf) : [];
  return { modules: next, added: next.filter(key => !modules.includes(key) && key !== id), removed: modules.filter(key => !next.includes(key) && key !== id), alternatives: [...new Set(alternatives)] };
}
export function pricingConfigurationKey(raw: unknown): string | null {
  const parsed = pricingRequestSchema.safeParse(raw); if (!parsed.success) return null;
  return JSON.stringify({ ...parsed.data, modules: [...parsed.data.modules].sort(), addons: [...parsed.data.addons].sort(), customModuleTier: [...parsed.data.customModuleTier].sort() });
}
export const pricingCalculationOptions = (user: AuthUser | null, currency: PricingCurrency = "JOD") => ({ mutationFn: async (raw: unknown) => {
  if (!canViewPricing(user)) throw denied(); const configuration = pricingRequestSchema.parse(raw);
  const estimate = estimateSnapshotSchema.parse(currency === "JOD" ? await pricingEndpoint("/pricing/calculate", configuration) : await pricingEndpoint("/pricing/calculate-converted", { configuration, currency }));
  if (estimate.currency !== currency || currency !== "JOD" && (!estimate.exchange || estimate.exchange.currency !== currency)) throw new ApiError(503, "EXCHANGE_RATES_UNAVAILABLE", "Converted pricing currency mismatch.");
  return { configurationKey: pricingConfigurationKey(configuration)!, estimate };
} });
export const savedEstimateOptions = (user: AuthUser | null, id: string) => ({ queryKey: ["pricing", "estimate", ...pricingActorKey(user), id], enabled: canViewPricing(user) && !!id, retry: false, refetchOnWindowFocus: true,
  queryFn: async () => { if (!canViewPricing(user)) throw denied(); return savedEstimateSchema.parse((await api.get<{ estimate: unknown }>(`/pricing/estimates/${encodeURIComponent(id)}`)).estimate); } });
export const savedEstimatesOptions = (user: AuthUser | null, filters: { page: number; search: string; scope: "all" | "standalone" | "linked"; companyId?: string }) => ({
  queryKey: ["pricing", "estimates", ...pricingActorKey(user), filters], enabled: canViewPricing(user), retry: false, refetchOnWindowFocus: true,
  queryFn: async () => { if (!canViewPricing(user)) throw denied(); return z.object({ items: z.array(savedEstimateSchema), total: z.number().int(), page: z.number().int(), pageSize: z.number().int() }).parse(await pricingEndpoint(`/pricing/estimates${toQuery({ ...filters, pageSize: 20 })}`)); },
});
export function pricingSaveOptions(client: QueryClient, user: AuthUser | null, sourceId?: string) {
  return { mutationFn: async (raw: CreatePricingEstimateInput) => {
    if (!canSavePricing(user)) throw denied(); const input = createPricingEstimateSchema.parse(raw);
    if (input.companyId && !canLinkPricing(user)) throw denied();
    return savedEstimateSchema.parse((await api.post<{ estimate: unknown }>(sourceId ? `/pricing/estimates/${encodeURIComponent(sourceId)}/copies` : "/pricing/estimates", input)).estimate);
  }, onSuccess: async () => { await client.invalidateQueries({ queryKey: ["pricing", "estimates"] }); } };
}
export function configurationForCopy(record: SavedEstimate, catalog: PricingCatalog): PricingRequest | null {
  if (record.result && typeof record.result === "object" && "pricingBasis" in record.result && record.result.pricingBasis === "PRICE_BOOK") return null; // Native copies require explicit book selection/version, not the legacy FX builder.
  if (record.catalogVersion !== catalog.catalogVersion || record.configurationVersion !== catalog.configurationVersion) return null;
  const parsed = pricingRequestSchema.safeParse(record.selection); return parsed.success ? parsed.data : null;
}
export function pricingCompanyOptions(user: AuthUser | null, search: string) {
  return { queryKey: ["pricing", "companies", ...pricingActorKey(user), search], enabled: canLinkPricing(user), retry: false,
    queryFn: async () => { if (!canLinkPricing(user)) throw denied(); return api.get<{ companies: Array<{ id: string; name: string }> }>(`/companies/options${toQuery({ search })}`); } };
}

export const initialPricingCurrency = (user: AuthUser | null): PricingCurrency => marketDisplayCurrency(user?.defaultMarketCode) ?? "JOD";
export const conversionSnapshotSchema = z.object({ exchange: pricingExchangeSchema, result: estimateSnapshotSchema }).refine(value => value.exchange.currency === value.result.currency, "Snapshot currency mismatch");
export function savedDisplaySnapshot(raw: unknown) {
  if (raw && typeof raw === "object" && "pricingBasis" in raw && raw.pricingBasis === "PRICE_BOOK") {
    const native = estimateSnapshotSchema.safeParse(raw);
    return native.success && native.data.priceBook && !("conversion" in raw) && native.data.currency === PRICE_BOOK_CURRENCIES[native.data.priceBook.id] && native.data.catalogVersion === native.data.priceBook.version ? native.data : null;
  }
  if (raw && typeof raw === "object" && "conversion" in raw) { const conversion = conversionSnapshotSchema.safeParse(raw.conversion); return conversion.success ? { ...conversion.data.result, exchange: conversion.data.exchange } : null; }
  const base = estimateSnapshotSchema.safeParse(raw); return base.success && base.data.currency === "JOD" ? base.data : null;
}

export const canArchivePricing = (user: AuthUser | null, estimate: Pick<SavedEstimate,"createdById">) => canSavePricing(user) && user?.id === estimate.createdById;
export function pricingArchiveOptions(client: QueryClient,user: AuthUser | null) {
  return { mutationFn: async (estimate: SavedEstimate) => {
    if (!canArchivePricing(user,estimate)) throw denied();
    return api.delete<{id:string;archived:boolean}>(`/pricing/estimates/${encodeURIComponent(estimate.id)}`);
  },onSuccess:async()=>{await client.invalidateQueries({queryKey:["pricing","estimates"]});await client.invalidateQueries({queryKey:["pricing","estimate"]});} };
}
