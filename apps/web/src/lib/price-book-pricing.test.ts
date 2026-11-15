import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { PRODUCT_STRUCTURE_VERSION, type AuthUser } from "@nbs/shared";
import { authorizedBooksSchema, nativeBookBundleOptions, nativeCalculationOptions, nativeSelectionFromDraft, nativeConfigurationForCopy } from "./price-book-pricing";
import { getPricingCatalog } from "../../../api/src/pricing/engine";
import { nativePriceBookPrices, priceBookMetadata, publishedPriceBook, calculateNativePriceBook } from "../../../api/src/pricing/price-books";
import { emptyPricingConfiguration, type SavedEstimate } from "./pricing";

test("native UI only fetches explicit permitted books, pins versions, strips FX/JOD request markers and validates responses", async t => {
  const user = { id: "fixture", permissions: ["pricing.view"] } as AuthUser;
  const access = authorizedBooksSchema.parse({ bookIds: ["US", "JO", "UK"], defaultBookId: "US", books: ["US", "JO", "UK"].map(id => priceBookMetadata(id as "US" | "JO" | "UK")) });
  assert.equal(access.defaultBookId, "US");
  const onlyJO = authorizedBooksSchema.parse({ bookIds: ["JO"], defaultBookId: "JO", books: [priceBookMetadata("JO")] });
  await assert.rejects(nativeBookBundleOptions(user, "US", onlyJO).queryFn(), /not authorized/);
  await assert.rejects(nativeBookBundleOptions({ ...user, permissions: [] }, "JO", onlyJO).queryFn(), /permission/);
  const catalog = getPricingCatalog().data;
  const draft = emptyPricingConfiguration(catalog, "erp");
  assert.ok(!("catalogVersion" in nativeSelectionFromDraft(draft)));
  let requestBody: Record<string, unknown> = {};
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    let data: unknown;
    if (url.includes("/prices")) { assert.ok(url.includes(encodeURIComponent(publishedPriceBook("US").version))); data = { ...nativePriceBookPrices(publishedPriceBook("US")), catalog }; }
    else { requestBody = JSON.parse(String(init?.body)); data = calculateNativePriceBook(nativeSelectionFromDraft(draft), publishedPriceBook("US")); }
    return new Response(JSON.stringify({ data }), { headers: { "Content-Type": "application/json" } });
  };
  const bundle = await nativeBookBundleOptions(user, "US", access).queryFn();
  assert.equal(bundle.prices.currency, "USD"); const coreQuote=bundle.prices.products.find(p => p.id === "erp")!.quote; assert.ok("amount" in coreQuote); assert.equal(coreQuote.amount, 1500);
  const calculated = await nativeCalculationOptions(user, bundle.reference).mutationFn(draft);
  assert.equal(calculated.estimate.estimatedTotal, 1500); assert.equal(calculated.estimate.exchange, undefined);
  assert.deepEqual(Object.keys(requestBody).sort(), ["configuration", "priceBook"]);
  assert.deepEqual(Object.keys(requestBody.priceBook as object).sort(), ["id", "structureVersion", "version"]);
  assert.ok(!("catalogVersion" in (requestBody.configuration as object)));
  const record = { configurationVersion: 1, catalogVersion: bundle.reference.version, selection: { ...draft, catalogVersion: bundle.reference.version }, result: calculated.estimate } as SavedEstimate;
  assert.deepEqual(nativeConfigurationForCopy(record, catalog), draft);
  assert.equal(nativeConfigurationForCopy({ ...record, result: { ...calculated.estimate, priceBook: { ...bundle.reference, structureVersion: "future-structure" } } }, catalog), null);
  assert.equal(bundle.reference.structureVersion, PRODUCT_STRUCTURE_VERSION);
});

test("native book workspace renders authorized selectors, exact server amounts, Draft v1, EN/AR, RTL and responsive layout without FX controls", () => {
  const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-"], { cwd: fileURLToPath(new URL("../../../../", import.meta.url)), encoding: "utf8", env: { ...process.env, TSX_TSCONFIG_PATH: "apps/web/tsconfig.json" }, input: `
    import assert from 'node:assert/strict';import {createElement as h} from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {createRequire} from 'node:module';
    const {QueryClient,QueryClientProvider}=createRequire(import.meta.url)('@tanstack/react-query');
    import {PricingDraft} from './apps/web/src/components/pricing/pricing-workspace.tsx';import {I18nProvider} from './apps/web/src/i18n/provider.tsx';
    import {nativeBookBundleOptions,authorizedBooksSchema} from './apps/web/src/lib/price-book-pricing.ts';
    import {getPricingCatalog} from './apps/api/src/pricing/engine.ts';import {nativePriceBookPrices,publishedPriceBook,priceBookMetadata} from './apps/api/src/pricing/price-books.ts';
    for(const locale of ['en','ar'])for(const id of ['JO','US','UK']){
      globalThis.window={localStorage:{getItem:()=>locale}};
      const book=publishedPriceBook(id),catalog=getPricingCatalog().data;
      const user={id:'fixture-'+id,permissions:['pricing.view','pricing.estimates.create']};
      const access=authorizedBooksSchema.parse({bookIds:[id],defaultBookId:id,books:[priceBookMetadata(id)]});
      globalThis.fetch=async()=>new Response(JSON.stringify({data:{...nativePriceBookPrices(book),catalog}}),{headers:{'Content-Type':'application/json'}});
      const bundle=await nativeBookBundleOptions(user,id,access).queryFn();const client=new QueryClient();
      const markup=renderToStaticMarkup(h(I18nProvider,null,h(QueryClientProvider,{client},h(PricingDraft,{user,catalog,prices:bundle.prices,native:{access,reference:bundle.reference}}))));
      assert.ok(markup.includes('id="pricing-book"'));assert.ok(!markup.includes('id="pricing-currency"'));assert.ok(!markup.includes('Frankfurter'));assert.ok(!markup.includes('pricing.'));
      assert.ok(markup.includes('dir="'+(locale==='ar'?'rtl':'ltr')+'"'));assert.ok(markup.includes('lg:sticky'));assert.ok(markup.includes('sm:grid-cols-2'));assert.ok(markup.includes('lg:hidden'));
      assert.ok(!markup.includes(locale==='ar'?'تكوين أولي نموذجي':'Typical starting configuration'));
      if(id!=='JO')assert.ok(markup.includes(locale==='ar'?'مسودة':'Draft v1'));
      for(const row of [...bundle.prices.products,...bundle.prices.modules.filter(m=>m.id.startsWith('erp-')),...bundle.prices.presets.filter(p=>p.id.startsWith('erp-')),...bundle.prices.addons,...bundle.prices.customModuleTiers]){
        const formatted=new Intl.NumberFormat(locale==='ar'?'ar-JO':'en-JO',{style:'currency',currency:book.currency,currencyDisplay:'code',minimumFractionDigits:book.currency==='JOD'?0:2,maximumFractionDigits:book.currency==='JOD'?3:2}).format(row.quote.amount);assert.ok(markup.includes(formatted),'Missing native price '+row.id);
      }
      client.clear();
    }
  ` });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
