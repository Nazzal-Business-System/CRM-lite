import assert from "node:assert/strict";
import test from "node:test";
import { QueryClient } from "@tanstack/react-query";
import { PERMISSION_KEYS as P, PRICING_CATALOG_VERSION, pricingRequestSchema, type AuthUser } from "@nbs/shared";
import { canLinkPricing, canSavePricing, configurationForCopy, emptyPricingConfiguration, estimateSnapshotSchema, pricingActorKey, pricingCalculationOptions, pricingCatalogOptions, pricingCompanyOptions, pricingConfigurationKey, pricingErrorKey, pricingSaveOptions, savedEstimateOptions, savedEstimatesOptions, togglePricingModule, type PricingCatalog, type SavedEstimate } from "./pricing";
import { ApiError } from "./api";
import { visibleNavSections } from "./navigation";
import { enMessages } from "../i18n/messages/en";
import { arMessages } from "../i18n/messages/ar";
import { localeDirection, translate } from "../i18n/config";

const actor = (permissions: string[], id = "fixture-user") => ({ id, permissions } as AuthUser);
const viewer = actor([P.PRICING_VIEW]); const creator = actor([P.PRICING_VIEW, P.PRICING_ESTIMATES_CREATE]);
// Non-priced fixture metadata. Commercial rules are tested separately by the API suite.
const catalog: PricingCatalog = { configurationVersion: 1, catalogVersion: PRICING_CATALOG_VERSION, currency: "JOD", products: ["erp", "pos", "ims", "custom"],
  modules: [
    { id: "erp-core", product: "erp", required: true, requires: [], recommends: [], requiresAnyOf: [], featureKeys: [], honesty: null },
    { id: "erp-inventory", product: "erp", required: false, requires: [], recommends: [], requiresAnyOf: [], featureKeys: [], honesty: null },
    { id: "erp-procurement", product: "erp", required: false, requires: ["erp-inventory"], recommends: [], requiresAnyOf: [], featureKeys: [], honesty: null },
    { id: "erp-sales", product: "erp", required: false, requires: ["erp-inventory"], recommends: [], requiresAnyOf: [], featureKeys: [], honesty: null },
    { id: "erp-operations", product: "erp", required: false, requires: ["erp-inventory"], recommends: [], requiresAnyOf: ["erp-procurement", "erp-sales"], featureKeys: [], honesty: "limitations" },
  ], presets: [], addons: [], customModuleTiers: [], customSoftwareTiers: ["focused-workflow"] };
const configuration = emptyPricingConfiguration(catalog, "erp");
const snapshot = { currency: "JOD", catalogVersion: PRICING_CATALOG_VERSION, configurationVersion: 1, estimatedTotal: 123.125, componentOnlyTotal: 133.125, bundleSavings: 10,
  presetApplied: "erp-operations", hasStartingFromItems: true, hasCustomQuotationItems: false, lineItems: [{ id: "erp-core", kind: "module", quote: { kind: "starting_from", amount: 123.125 }, amount: 123.125, isEstimateFloor: true }] };
const record: SavedEstimate = { id: "estimate/fixture", createdById: creator.id, companyId: null, title: "Fixture", notes: "Private", currency: "JOD", catalogVersion: PRICING_CATALOG_VERSION, calculationVersion: "fixture-calculation", configurationVersion: 1, selection: configuration, result: snapshot, createdAt: "2026-11-14T00:00:00Z" };

test("pricing navigation and operations require explicit permissions, never Admin status alone", async (t) => {
  let requests = 0; t.mock.method(globalThis, "fetch", async () => { requests++; throw new Error("unexpected request"); });
  const admin = { ...actor([]), roles: ["Admin"] } as unknown as AuthUser;
  assert.equal(canSavePricing(viewer), false); assert.equal(canSavePricing(creator), true); assert.equal(canLinkPricing(creator), false);
  assert.equal(canLinkPricing(actor([...creator.permissions, P.COMPANIES_VIEW])), true);
  const visible = (permissions: string[]) => visibleNavSections(permissions).flatMap(section => section.items).some(item => item.href === "/pricing");
  assert.equal(visible([]), false); assert.equal(visible([P.PRICING_ESTIMATES_CREATE]), false); assert.equal(visible([P.PRICING_VIEW]), true);
  await assert.rejects(pricingCatalogOptions(admin).queryFn(), { status: 403 });
  await assert.rejects(pricingCalculationOptions(admin).mutationFn(configuration), { status: 403 });
  const client = new QueryClient(); t.after(() => client.clear());
  await assert.rejects(pricingSaveOptions(client, viewer).mutationFn({ title: "Test", notes: "", companyId: null, configuration }), { status: 403 });
  await assert.rejects(pricingSaveOptions(client, creator).mutationFn({ title: "Test", notes: "", companyId: "company", configuration }), { status: 403 });
  await assert.rejects(pricingCompanyOptions(creator, "").queryFn(), { status: 403 }); assert.equal(requests, 0);
});
test("metadata dependencies add prerequisites, preserve explicit Operations alternatives, and cascade removal", () => {
  let modules = togglePricingModule(catalog, configuration.modules, "erp-operations", true);
  assert.deepEqual(new Set(modules), new Set(["erp-core", "erp-operations", "erp-inventory"]));
  assert.equal(pricingRequestSchema.safeParse({ ...configuration, modules }).success, false);
  for (const alternative of ["erp-procurement", "erp-sales"] as const) {
    const valid = togglePricingModule(catalog, modules, alternative, true);
    assert.equal(pricingRequestSchema.safeParse({ ...configuration, modules: valid }).success, true);
  }
  modules = togglePricingModule(catalog, modules, "erp-sales", true);
  assert.deepEqual(togglePricingModule(catalog, modules, "erp-inventory", false), ["erp-core"]);
  assert.deepEqual(togglePricingModule(catalog, ["erp-core"], "erp-core", false), ["erp-core"]);
  const custom = emptyPricingConfiguration(catalog, "custom"); assert.equal(pricingConfigurationKey(custom), null);
  assert.ok(pricingConfigurationKey({ ...custom, customSoftwareTier: "focused-workflow" }));
});
test("calculation rejects malformed/forged inputs and returns authoritative amounts with request identity", async (t) => {
  const bodies: unknown[] = []; t.mock.method(globalThis, "fetch", async (_path: string, init: RequestInit) => { bodies.push(JSON.parse(init.body as string)); return Response.json({ data: snapshot }); });
  for (const invalid of [{ ...configuration, estimatedTotal: 1 }, { ...configuration, modules: ["erp-core", "pos-core"] }, { ...configuration, modules: ["erp-core", "erp-core"] }, { ...configuration, product: "custom" }, { ...configuration, catalogVersion: "forged" }]) await assert.rejects(pricingCalculationOptions(viewer).mutationFn(invalid));
  assert.equal(bodies.length, 0);
  const response = await pricingCalculationOptions(viewer).mutationFn(configuration);
  assert.deepEqual(response.estimate, snapshot); assert.deepEqual(bodies, [configuration]);
  assert.equal(response.configurationKey, pricingConfigurationKey(configuration));
  assert.notEqual(response.configurationKey, pricingConfigurationKey({ ...configuration, addons: ["staff-training"] }));
  assert.equal(pricingConfigurationKey({ ...configuration, modules: ["erp-core", "erp-inventory"] }), pricingConfigurationKey({ ...configuration, modules: ["erp-inventory", "erp-core"] }));
});
test("save and immutable-copy requests carry only validated configuration, never result snapshots", async (t) => {
  const calls: Array<{ path: string; body: unknown }> = []; t.mock.method(globalThis, "fetch", async (path: string, init: RequestInit) => { calls.push({ path, body: JSON.parse(init.body as string) }); return Response.json({ data: { estimate: record } }); });
  const client = new QueryClient(); t.after(() => client.clear()); const input = { title: "Fixture", notes: "", companyId: null, configuration };
  await pricingSaveOptions(client, creator).mutationFn(input);
  await pricingSaveOptions(client, creator, record.id).mutationFn(input);
  assert.deepEqual(calls.map(call => call.path), ["/api/pricing/estimates", "/api/pricing/estimates/estimate%2Ffixture/copies"]);
  assert.deepEqual(calls[0].body, input);
  await assert.rejects(pricingSaveOptions(client, creator).mutationFn({ ...input, result: snapshot } as typeof input));
  assert.equal(calls.length, 2); assert.deepEqual(record.result, snapshot);
});
test("saved historical reads never recalculate; unsupported catalogs cannot silently become current copies", async (t) => {
  const historical = { ...record, catalogVersion: "historical-v0", result: { ...snapshot, catalogVersion: "historical-v0" } };
  const calls: string[] = []; t.mock.method(globalThis, "fetch", async (path: string) => { calls.push(path); return Response.json({ data: { estimate: historical } }); });
  const read = await savedEstimateOptions(viewer, record.id).queryFn();
  assert.equal(estimateSnapshotSchema.parse(read.result).estimatedTotal, snapshot.estimatedTotal);
  assert.deepEqual(calls, ["/api/pricing/estimates/estimate%2Ffixture"]);
  assert.equal(configurationForCopy(read, catalog), null); assert.deepEqual(configurationForCopy(record, catalog), configuration);
  assert.equal(configurationForCopy({ ...record, selection: { ...configuration, totals: 2 } }, catalog), null);
});
test("private query keys isolate actors and permission changes; list requests preserve server scope", async (t) => {
  assert.notDeepEqual(pricingActorKey(viewer), pricingActorKey(actor(viewer.permissions, "second")));
  assert.notDeepEqual(savedEstimateOptions(viewer, record.id).queryKey, savedEstimateOptions(creator, record.id).queryKey);
  let url = ""; t.mock.method(globalThis, "fetch", async (path: string) => { url = path; return Response.json({ data: { items: [], total: 0, page: 2, pageSize: 20 } }); });
  await savedEstimatesOptions(viewer, { page: 2, search: "Private title", scope: "linked", companyId: "market-company" }).queryFn();
  const query = new URL(url, "http://localhost").searchParams;
  assert.equal(query.get("page"), "2"); assert.equal(query.get("scope"), "linked"); assert.equal(query.get("companyId"), "market-company"); assert.equal(query.get("search"), "Private title");
});
test("outages and company-market denial preserve identity; retry recovers without replacing a snapshot", async (t) => {
  const client = new QueryClient(); t.after(() => client.clear()); client.setQueryData(["auth", "me"], creator);
  let status = 503; t.mock.method(globalThis, "fetch", async () => status === 200 ? Response.json({ data: { estimate: record } }) : Response.json({ error: { code: status === 503 ? "SERVICE_UNAVAILABLE" : "NOT_FOUND" } }, { status }));
  const input = { title: "Fixture", notes: "", companyId: null, configuration };
  await assert.rejects(pricingSaveOptions(client, creator).mutationFn(input), { status: 503 });
  status = 404; await assert.rejects(savedEstimateOptions(creator, record.id).queryFn(), { status: 404 });
  assert.deepEqual(client.getQueryData(["auth", "me"]), creator);
  status = 200; assert.deepEqual(await pricingSaveOptions(client, creator).mutationFn(input), record);
  assert.equal(pricingErrorKey(new ApiError(503, "SERVICE_UNAVAILABLE", "")), "pricing.unavailable");
  assert.equal(pricingErrorKey(new ApiError(403, "FORBIDDEN", "")), "pricing.denied");
});
test("EN/AR pricing labels cover all keys and preserve interpolation and locale direction", () => {
  const paths = (value: object, prefix = ""): string[] => Object.entries(value).flatMap(([key, item]) => typeof item === "string" ? [prefix + key] : paths(item, prefix + key + "."));
  assert.deepEqual(paths(enMessages.pricing).sort(), paths(arMessages.pricing).sort());
  for (const path of paths(enMessages.pricing)) { assert.ok(translate(arMessages, `pricing.${path}`).trim()); assert.notEqual(translate(arMessages, `pricing.${path}`), `pricing.${path}`); }
  assert.equal(localeDirection("ar"), "rtl"); assert.equal(localeDirection("en"), "ltr");
  assert.ok(!translate(arMessages, "pricing.requires", { names: "Inventory" }).includes("{names}"));
});
