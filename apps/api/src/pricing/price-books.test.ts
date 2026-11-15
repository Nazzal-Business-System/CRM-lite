import assert from "node:assert/strict";
import test from "node:test";
import { PRICE_BOOK_IDS, PRODUCT_STRUCTURE_VERSION, PRICING_CATALOG_VERSION, priceBookIdSchema, replacePriceBookAccessSchema, type PricingRequest } from "@nbs/shared";
import { presets, allModules } from "./catalog";
import { calculatePricing } from "./engine";
import { publishedPriceBook, publishedPriceBookSchema, priceBookRegistry, calculateNativePriceBook, nativePriceBookPrices } from "./price-books";
import { convertPricingPrices, createPricingRateService } from "../services/pricing-currency.service";
const selection = (patch: Partial<PricingRequest> = {}): PricingRequest => ({ configurationVersion: 1, catalogVersion: PRICING_CATALOG_VERSION, product: "erp", modules: ["erp-core"], addons: [], customModuleTier: [], customSoftwareTier: null, customNotes: "", ...patch });
test("exactly three internal books; US/UK Draft v1 is available internally, never publicly approved", () => {
    assert.deepEqual(PRICE_BOOK_IDS, ["JO", "US", "UK"]);
    assert.equal(priceBookIdSchema.safeParse("OTHER").success, false);
    for (const id of ["US","UK"] as const){const book=publishedPriceBook(id);assert.equal(book.reviewStatus,"draft_v1");assert.equal(book.internalOnly,true);assert.equal(book.publiclyApproved,false);assert.ok(priceBookRegistry[id].currentVersion);assert.throws(()=>publishedPriceBook(id,"not-approved"),{status:503});}
    for (const version of ["unknown", "__proto__", "constructor"]) assert.throws(() => publishedPriceBook("JO", version), { status: 503 });
    assert.ok(Object.isFrozen(priceBookRegistry.JO.versions));
    assert.equal(replacePriceBookAccessSchema.safeParse({ scope: "selected", bookIds: ["JO"], defaultBookId: "UK" }).success, false);
    assert.equal(replacePriceBookAccessSchema.safeParse({ scope: "international", defaultBookId: "OTHER" }).success, false);
});
test("JO native calculations preserve all preset/core/commercial rules and itemized amounts", () => {
    const book = publishedPriceBook("JO");
    const configurations = [selection(), ...presets.map(p => selection({ product: p.product, modules: [...p.moduleIds] })), selection({ addons: ["staff-training", "custom-report"], customModuleTier: ["focused-module", "business-module", "advanced-module"] }), ...(["focused-workflow", "connected-system", "larger-platform"] as const).map(tier => selection({ product: "custom", modules: [], customSoftwareTier: tier }))];
    for (const input of configurations) {
        const legacy = calculatePricing(input).data;
        const { catalogVersion: _catalogVersion, ...selection } = input;
        const native = calculateNativePriceBook(selection, book);
        for (const field of ["estimatedTotal", "componentOnlyTotal", "bundleSavings", "presetApplied", "hasStartingFromItems", "hasCustomQuotationItems", "lineItems"] as const)
            assert.deepEqual(native[field], legacy[field]);
        assert.equal(native.priceBook.id, "JO");
        assert.equal(native.priceBook.structureVersion, PRODUCT_STRUCTURE_VERSION);
    }
    assert.equal(nativePriceBookPrices(book).products.find(p => p.id === "erp")?.quote.amount, 750);
});
test("book validation rejects missing, foreign, incompatible and excessive-precision commercial data", () => {
    const original = publishedPriceBook("JO");
    const missing = structuredClone(original);
    delete missing.amounts.modules["erp-core"];
    assert.equal(publishedPriceBookSchema.safeParse(missing).success, false);
    for (const alter of [(b: typeof missing) => { b.currency = "USD"; }, (b: typeof missing) => { b.amounts.modules["forged"] = { kind: "exact", amount: 1 }; }, (b: typeof missing) => { b.amounts.modules["erp-core"] = { kind: "exact", amount: 1.5 }; }, (b: typeof missing) => { b.amounts.presets["erp-operations"] = Number.MAX_SAFE_INTEGER; }, (b: typeof missing) => { b.amounts.modules["erp-core"] = { kind: "starting_from", amount: 750000 }; }]) {
        const book = structuredClone(original);
        alter(book);
        assert.equal(publishedPriceBookSchema.safeParse(book).success, false);
    }
    // Synthetic test-only native cents, deliberately independent of JOD/FX; never registered/published.
    const fixture = structuredClone(original);
    fixture.id = "US";
    fixture.currency = "USD";
    fixture.version = "isolated-test-only";
    fixture.approvalReference = "Isolated fixture, not commercial approval";
    fixture.amounts.modules["erp-core"] = { kind: "exact", amount: 10100 };
    for (const preset of presets)
        fixture.amounts.presets[preset.id] = preset.moduleIds.reduce((sum, id) => sum + (fixture.amounts.modules[id] as {
            amount: number;
        }).amount, 0);
    const { catalogVersion: _catalogVersion, ...nativeSelection } = selection();
    const result = calculateNativePriceBook(nativeSelection, publishedPriceBookSchema.parse(fixture));
    assert.equal(result.estimatedTotal, 101);
    assert.equal(result.currency, "USD");
    assert.equal(publishedPriceBook("US").amounts.modules["erp-core"]?.kind,"exact");
});
test("ERP unsupported typical reference is absent in JOD and every derived currency", async () => {
    const rates = createPricingRateService(async () => Response.json([{ date: "2026-11-14", base: "JOD", quote: "USD", rate: 1.25 }, { date: "2026-11-14", base: "JOD", quote: "GBP", rate: 1.1 }]), () => Date.parse("2026-11-14T12:00:00Z"));
    for (const currency of ["JOD", "USD", "GBP"] as const) {
        const view = convertPricingPrices(await rates.get(currency));
        assert.equal(view.products.find(p => p.id === "erp")?.typicalQuote, null);
    }
    assert.deepEqual(allModules.find(m => m.id === "erp-core")?.quote, { kind: "exact", amount: 750 });
});
