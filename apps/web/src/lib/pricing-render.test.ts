import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

test("pricing markup renders EN/AR server amounts, limitations and RTL select direction without a browser", () => {
  // The existing TSX loader needs the web path aliases/JSX mode for component rendering.
  const root = fileURLToPath(new URL("../../../../", import.meta.url));
  const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-"], { cwd: root, encoding: "utf8", env: { ...process.env, TSX_TSCONFIG_PATH: "apps/web/tsconfig.json" }, input: `
    import assert from 'node:assert/strict';
    import {createElement as h} from 'react';
    import {renderToStaticMarkup} from 'react-dom/server';
    import {I18nProvider} from './apps/web/src/i18n/provider.tsx';
    import {PriceBreakdown,PricingError,PricingNavigation} from './apps/web/src/components/pricing/pricing-shared.tsx';
    import {DemoCards,ReferenceResources,DemoGuidance} from './apps/web/src/components/demos/demos-workspace.tsx';
    import {liveDemos} from './apps/api/src/config/demos.ts';
    import {PartnerMarketFields} from './apps/web/src/components/users/partner-market-fields.tsx';
    import {INITIAL_SALES_MARKETS} from '@nbs/shared';
    import {OptionCard} from './apps/web/src/components/pricing/pricing-options.tsx';
    import {EnumSelect} from './apps/web/src/components/crm/selects.tsx';
    import {createRequire} from 'node:module';
    const {QueryClient,QueryClientProvider}=createRequire(import.meta.url)('@tanstack/react-query');
    import {PricingDraft} from './apps/web/src/components/pricing/pricing-workspace.tsx';
    import {getPricingCatalog} from './apps/api/src/pricing/engine.ts';
    import {getPricingPrices} from './apps/api/src/pricing/presentation.ts';
    import {convertPricingPrices,convertPricingEstimate} from './apps/api/src/services/pricing-currency.service.ts';
    import {calculatePricing} from './apps/api/src/pricing/engine.ts';
    import {pricingPricesOptions} from './apps/web/src/lib/pricing.ts';
    import {pricingPricesSchema,assertPricingVersions,emptyPricingConfiguration} from './apps/web/src/lib/pricing.ts';
    import {ApiError} from './apps/web/src/lib/api.ts';
    const estimate={currency:'JOD',catalogVersion:'fixture-snapshot',configurationVersion:1,estimatedTotal:123.125,componentOnlyTotal:133.125,bundleSavings:10,presetApplied:null,hasStartingFromItems:true,hasCustomQuotationItems:true,lineItems:[{id:'staff-training',kind:'addon',quote:{kind:'per_session',amount:123.125},amount:123.125,isEstimateFloor:true}]};
    for(const locale of ['en','ar']){
      globalThis.window={localStorage:{getItem:()=>locale}};
      const render=child=>renderToStaticMarkup(h(I18nProvider,null,child));
      const markup=render(h(PriceBreakdown,{estimate}));
      assert.ok(markup.includes('fixture-snapshot'));assert.ok(markup.includes('<bdi>'));
      assert.ok(markup.includes(locale==='ar'?'جلسة':'One training session'));
      assert.ok(!markup.includes('pricing.'));assert.ok(markup.includes('minmax(0,1fr)'));
      const liveMarkup=render(h(PriceBreakdown,{estimate,embedded:true,hideSummary:true}));
      const versionDetails=liveMarkup.slice(liveMarkup.indexOf('<details'),liveMarkup.indexOf('</details>')+10);
      assert.ok(versionDetails&&versionDetails.includes('fixture-snapshot'));assert.ok(!versionDetails.includes(' open'));
      assert.ok(!liveMarkup.replace(versionDetails,'').includes('fixture-snapshot'));assert.equal(estimate.catalogVersion,'fixture-snapshot');
      assert.ok(versionDetails.includes(locale==='ar'?'إصدار دليل التسعير':'Pricing catalog version'));
      assert.ok(!markup.includes('cursor-pointer'));
      const longTitle=locale==='ar'?'إدارة العمليات والمبيعات والمشتريات والتقارير المتقدمة':'Operations, sales, procurement and advanced reporting';
      const longModules=locale==='ar'?'المخزون · المشتريات · المبيعات · العمليات · المالية · المحاسبة · التقارير':'Inventory · Procurement · Sales · Operations · Finance · Accounting · Reporting';
      for(const compact of [false,true]){
        const card=render(h(OptionCard,{title:longTitle,selected:true,quote:estimate.lineItems[0].quote,footer:'Footer marker',compact,onClick:()=>{}},longModules));
        assert.ok(card.includes(longTitle));assert.ok(card.includes(longModules));
        assert.ok(card.includes('grid-rows-subgrid'));assert.ok(card.includes('row-span-4'));assert.ok(card.includes('h-full'));
        assert.ok(card.includes('self-end'));assert.ok(card.indexOf(longModules)<card.indexOf('Footer marker'));
        assert.ok(!card.includes('line-clamp'));assert.ok(!card.includes('truncate'));assert.ok(!card.includes('max-h-'));
        assert.ok(card.includes('type="button"'));assert.ok(card.includes('aria-pressed="true"'));
        assert.ok(card.includes('cursor-pointer'));assert.ok(card.includes('disabled:cursor-not-allowed'));assert.ok(card.includes('focus-visible:outline-2'));
        let clicks=0;const action=()=>{clicks++;};
        const surface=OptionCard({title:longTitle,selected:false,compact,onClick:action,children:longModules});
        assert.equal(surface.type,'button');assert.equal(surface.props.onClick,action);surface.props.onClick();assert.equal(clicks,1);
        const disabledCard=render(h(OptionCard,{title:longTitle,selected:false,disabled:true,compact,onClick:action},longModules));
        assert.ok(disabledCard.includes('disabled=""'));assert.ok(disabledCard.includes('disabled:cursor-not-allowed'));
      }
      const markets=render(h(PartnerMarketFields,{markets:[...INITIAL_SALES_MARKETS],selected:['JO','UK'],defaultMarketCode:'UK',global:false,onChange:()=>{}}));
      assert.ok(markets.includes('GBP'));assert.ok(markets.includes('sm:grid-cols-2'));assert.ok(!markets.includes('partners.'));assert.ok(markets.includes('dir="'+(locale==='ar'?'rtl':'ltr')+'"'));
      const select=render(h(EnumSelect,{dir:locale==='ar'?'rtl':'ltr',value:'erp',options:[{value:'erp',label:'ERP'}],onChange:()=>{}}));
      assert.ok(select.includes('dir="'+(locale==='ar'?'rtl':'ltr')+'"'));
      const demos=render(h('div',null,h(DemoCards,{demos:liveDemos.demos}),h(ReferenceResources,{resources:liveDemos.resources}),h(DemoGuidance)));
      assert.equal((demos.match(/target="_blank"/g)||[]).length,4);assert.equal((demos.match(/rel="noopener noreferrer"/g)||[]).length,4);
      assert.ok(demos.includes('md:grid-cols-2')&&demos.includes('xl:grid-cols-3'));assert.ok(!demos.includes('demos.systems.'));assert.ok(!demos.includes('demos.referencesTitle'));assert.ok(demos.includes(locale==='ar'?'فتح العرض التجريبي':'Open Demo'));
      for(const demo of [...liveDemos.demos,...liveDemos.resources])assert.ok(demos.includes('href="'+demo.url+'"'));
      const externalCards=demos.match(/<a[^>]*>/g)||[];assert.equal(externalCards.length,4);
      assert.ok(externalCards.every(card=>card.includes('cursor-pointer')&&card.includes('focus-visible:outline-2')));assert.ok(!demos.includes('<button'));
      assert.ok(demos.includes(locale==='ar'?'مرجع للمبيعات':'Sales reference'));assert.ok(demos.includes(locale==='ar'?'اجعل الاستعراض مفيدًا':'Make the walkthrough useful'));
      assert.ok(demos.includes(locale==='ar'?'قد يختلف توفر الخصائص':'Availability and behavior can vary'));
      assert.ok(!demos.includes('innovation-pos.vercel.app'));assert.ok(!demos.includes('<img'));
      const client=new QueryClient();
      const catalog=getPricingCatalog().data;const prices=pricingPricesSchema.parse(getPricingPrices().data);assertPricingVersions(catalog,prices);
      assert.equal(prices.products.find(item=>item.id==='erp').quote.amount,750);assert.equal(prices.products.find(item=>item.id==='erp').typicalQuote,null);
      for(const product of catalog.products){
      const selection=emptyPricingConfiguration(catalog,product);if(product==='custom')selection.customSoftwareTier=catalog.customSoftwareTiers[0];
      const source={id:'fixture-copy',catalogVersion:catalog.catalogVersion,configurationVersion:catalog.configurationVersion,title:'Fixture',notes:'',companyId:null,selection};
      const draft=render(h(QueryClientProvider,{client},h(PricingDraft,{user:{id:'fixture',permissions:['pricing.view','pricing.estimates.create','companies.view']},catalog,prices,source})));
      assert.ok(!draft.includes('pricing.'));assert.ok(draft.includes('aria-pressed="true"'));assert.ok(draft.includes('lg:sticky'));assert.ok(draft.includes('lg:hidden'));
      assert.ok(!draft.includes(locale==='ar'?'تكوين أولي نموذجي':'Typical starting configuration'));
      for(const price of [...prices.products,...prices.presets.filter(item=>item.id.startsWith(product+'-')),...prices.modules.filter(item=>item.id.startsWith(product+'-')),...prices.addons,...prices.customModuleTiers,...(product==='custom'?prices.customSoftwareTiers:[])]){
        if('amount' in price.quote){const formatted=new Intl.NumberFormat(locale==='ar'?'ar-JO':'en-JO',{style:'currency',currency:'JOD',currencyDisplay:'code',minimumFractionDigits:0,maximumFractionDigits:3}).format(price.quote.amount);assert.ok(draft.includes(formatted),'missing server price '+price.id);}
      }
      assert.ok(draft.includes('id="pricing-estimate"'));assert.ok(!draft.includes(locale==='ar'?'حساب التقدير':'Calculate estimate'));
      }
      for(const [currency,market]of [['GBP','UK'],['USD','OTHER']]){
        const exchange={version:'fx-line-half-up-v1',base:'JOD',currency,rate:1.25,source:'Frankfurter v2',sourceUrl:'https://frankfurter.dev/',effectiveDate:'2026-11-14',retrievedAt:'2026-11-14T12:00:00.000Z',expiresAt:'2026-11-14T18:00:00.000Z'};
        const actor={id:'fixture-fx',defaultMarketCode:market,permissions:['pricing.view','pricing.estimates.create','companies.view']};
        client.setQueryData(pricingPricesOptions(actor,currency).queryKey,convertPricingPrices(exchange));
        const draft=render(h(QueryClientProvider,{client},h(PricingDraft,{user:actor,catalog,prices})));
        assert.ok(draft.includes('id="pricing-currency"'));assert.ok(draft.includes('https://frankfurter.dev/'));assert.ok(draft.includes('2026-11-14'));assert.ok(!draft.includes('pricing.displayCurrency'));assert.ok(!draft.includes('pricing.exchangeDetails'));
        assert.ok(draft.includes(new Intl.NumberFormat(locale==='ar'?'ar-JO':'en-JO',{style:'currency',currency,currencyDisplay:'code',minimumFractionDigits:2,maximumFractionDigits:2}).format(937.5)));
        const configured=emptyPricingConfiguration(catalog,'erp');const converted={...convertPricingEstimate(calculatePricing(configured).data,exchange),exchange};
        const detail=render(h(PriceBreakdown,{estimate:converted}));assert.ok(detail.includes('Frankfurter v2'));assert.ok(detail.includes('2026-11-14'));
        assert.ok(detail.includes(locale==='ar'?'تقدير محوّل':'Converted estimate'));assert.ok(!detail.includes('pricing.convertedHint'));
      }
      client.clear();
      const denied=render(h(PricingError,{error:new ApiError(403,'FORBIDDEN',''),retry:()=>{}}));
      assert.ok(denied.includes('role="alert"'));assert.ok(!denied.includes('<button'));
      const missing=render(h(PricingError,{error:new ApiError(404,'PRICING_ENDPOINT_MISSING',''),retry:()=>{}}));
      assert.ok(missing.includes('<button'));assert.ok(!missing.includes(locale==='ar'?'لم يعد لديك':'no longer have access'));
      const cachedMissing=render(h(PricingError,{context:'service',error:new ApiError(404,'NOT_FOUND',''),retry:()=>{}}));
      assert.ok(cachedMissing.includes('<button'));
      const navigation=render(h(PricingNavigation,{saved:true}));
      assert.equal((navigation.match(/aria-current="page"/g)||[]).length,1);assert.ok(!navigation.includes('underline'));
      assert.ok(navigation.includes('href="/pricing/estimates"'));assert.ok(navigation.includes('href="/pricing"'));
      delete globalThis.window;
    }
    console.log('EN/AR pricing rendering and RTL select assertions passed');
  ` });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
