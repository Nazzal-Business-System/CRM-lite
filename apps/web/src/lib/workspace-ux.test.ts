import assert from "node:assert/strict";
import test from "node:test";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import type {AuthUser} from "@nbs/shared";
import {QueryClient} from "@tanstack/react-query";
import {canArchivePricing,pricingArchiveOptions,type SavedEstimate} from "./pricing";
test("archive frontend requires creator and save permission, uses DELETE and invalidates list/detail without mutating snapshots",async t=>{
 const who={id:"creator",permissions:["pricing.view","pricing.estimates.create"]} as AuthUser;
 const row={id:"immutable",createdById:who.id,result:{currency:"GBP",estimatedTotal:825,conversion:{rate:1.1}}} as unknown as SavedEstimate;
 const before=structuredClone(row);const client=new QueryClient();t.after(()=>client.clear());
 assert.equal(canArchivePricing(who,row),true);assert.equal(canArchivePricing({...who,id:"other"},row),false);
 await assert.rejects(pricingArchiveOptions(client,{...who,permissions:["pricing.view"]}).mutationFn(row),{status:403});
 const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});globalThis.fetch=async(path,init)=>{assert.equal(path,"/api/pricing/estimates/immutable");assert.equal(init?.method,"DELETE");return Response.json({data:{id:row.id,archived:true}});};
 const options=pricingArchiveOptions(client,who);assert.deepEqual(await options.mutationFn(row),{id:row.id,archived:true});await options.onSuccess();assert.deepEqual(row,before);
});
test("sidebar persists independent expanded defaults and keyboard-ready sections; compact pagination and revision labels render EN/AR/RTL",()=>{
 const result=spawnSync(process.execPath,["--import","tsx","--input-type=module","-"],{cwd:fileURLToPath(new URL("../../../../",import.meta.url)),encoding:"utf8",env:{...process.env,TSX_TSCONFIG_PATH:"apps/web/tsconfig.json"},input:`
 import assert from 'node:assert/strict';import {createElement as h}from'react';import{renderToStaticMarkup}from'react-dom/server';
 const storage=new Map();globalThis.localStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)};globalThis.window={localStorage:globalThis.localStorage};
 const {useSidebarStore:store}=await import('./apps/web/src/stores/sidebar-store.ts');
 assert.deepEqual(store.getState().sectionCollapsed,{workspace:false,administration:false});store.getState().toggleSection('workspace');assert.equal(store.getState().sectionCollapsed.workspace,true);assert.equal(store.getState().sectionCollapsed.administration,false);
 const persisted=storage.get('nbs-sidebar');assert.equal(JSON.parse(persisted).state.sectionCollapsed.workspace,true);
 store.setState({sectionCollapsed:{workspace:false,administration:false}});storage.set('nbs-sidebar',persisted);await store.persist.rehydrate();assert.equal(store.getState().sectionCollapsed.workspace,true);
 storage.set('nbs-sidebar',JSON.stringify({state:{collapsed:true},version:0}));store.setState({sectionCollapsed:{workspace:false,administration:false}});storage.set('nbs-sidebar',JSON.stringify({state:{collapsed:true},version:0}));await store.persist.rehydrate();assert.deepEqual(store.getState().sectionCollapsed,{workspace:false,administration:false});
 delete globalThis.window;
 const {SidebarSection}=await import('./apps/web/src/components/layout/sidebar.tsx');const {CompactPagination}=await import('./apps/web/src/components/crm/primitives.tsx');const {I18nProvider}=await import('./apps/web/src/i18n/provider.tsx');
 const {pricingEn}=await import('./apps/web/src/i18n/messages/pricing-en.ts');const {pricingAr}=await import('./apps/web/src/i18n/messages/pricing-ar.ts');
 for(const locale of ['en','ar']){
  globalThis.window={localStorage:{getItem:()=>locale}};
  for(const collapsed of [false,true])for(const expanded of [false,true]){
   const markup=renderToStaticMarkup(h(SidebarSection,{label:locale==='ar'?'مساحة العمل':'Workspace',collapsed,expanded,onToggle:()=>{}},h('a',{href:'/companies',className:'bg-sidebar-accent'},'Companies')));
   assert.ok(markup.includes('type="button"'));assert.ok(markup.includes('aria-expanded="'+expanded+'"'));assert.ok(markup.includes('aria-controls='));assert.ok(markup.includes('focus-visible:outline-2'));assert.equal(markup.includes('hidden=""'),!expanded);assert.ok(markup.includes('bg-sidebar-accent'));assert.ok(markup.includes('rtl:rotate-90')===!expanded);
  }
  for(const [page,total,disabled] of [[1,74,1],[4,74,1],[2,74,0],[1,0,2],[1,1,2]]){
   const markup=renderToStaticMarkup(h(I18nProvider,null,h(CompactPagination,{page,pageSize:20,total,onPageChange:()=>{}})));
   assert.equal((markup.match(/<button/g)||[]).length,2);assert.equal((markup.match(/disabled=""/g)||[]).length,disabled);assert.ok(markup.includes('aria-label='));assert.ok(markup.includes('title='));assert.ok(markup.includes('rtl:rotate-180'));assert.ok(!markup.includes('common.'));assert.ok(markup.includes('tabular-nums'));
  }
  const copy=locale==='ar'?pricingAr:pricingEn;assert.ok(copy.nativeCopyHint.includes(locale==='ar'?'إصدارًا جديدًا':'new revision'));assert.ok(copy.archiveHint.includes(locale==='ar'?'التاريخية':'historical'));assert.ok(copy.editEstimate);assert.ok(copy.saveRevision);
 }
 `});assert.equal(result.status,0,result.stderr||result.stdout);
});
