import assert from "node:assert/strict";
import test from "node:test";
import { publishedPriceBook,nativePriceBookPrices,calculateNativePriceBook } from "./price-books";
import { usDraftV1,ukDraftV1 } from "./schedules/draft-v1";
import { presets } from "./catalog";
import { PRODUCT_STRUCTURE_VERSION } from "@nbs/shared";
const savings={US:[300,550,800,0,0,0,0,100],UK:[250,400,600,0,0,0,0,100]};
test("all exact Draft v1 amounts, namespaces, eight preset totals/savings and internal-only provenance match",()=>{
 for(const[id,schedule]of [["US",usDraftV1],["UK",ukDraftV1]] as const){const book=publishedPriceBook(id);assert.equal(book.reviewStatus,"draft_v1");assert.equal(book.publiclyApproved,false);assert.equal(book.internalOnly,true);assert.equal(book.structureVersion,PRODUCT_STRUCTURE_VERSION);
  assert.deepEqual(Object.values(schedule).map(group=>Object.keys(group).length),[20,8,11,3,3]);
  for(const kind of ["modules","addons","customModules","customSoftware"] as const)for(const[key,value]of Object.entries(schedule[kind])){const quote=book.amounts[kind][key]!;assert.ok("amount"in quote);assert.equal(quote.amount,value*100,id+":"+kind+":"+key);}
  const prices=nativePriceBookPrices(book);for(const[index,preset]of presets.entries()){const view=prices.presets.find(p=>p.id===preset.id)!;assert.equal(view.quote.amount,schedule.presets[preset.id]);assert.equal(view.savings,savings[id][index]);const result=calculateNativePriceBook({configurationVersion:1,product:preset.product,modules:[...preset.moduleIds],addons:[],customModuleTier:[],customSoftwareTier:null,customNotes:""},book);assert.equal(result.estimatedTotal,schedule.presets[preset.id]);assert.equal(result.bundleSavings,savings[id][index]);assert.equal(result.lineItems.reduce((sum,line)=>sum+line.amount,0),result.estimatedTotal);}
  const training=calculateNativePriceBook({configurationVersion:1,product:"erp",modules:["erp-core"],addons:["staff-training"],customModuleTier:[],customSoftwareTier:null,customNotes:""},book);assert.equal(training.estimatedTotal,schedule.modules["erp-core"]+schedule.addons["staff-training"]);assert.equal(training.lineItems.find(l=>l.id==="staff-training")?.quote.kind,"per_session");
  const tiers=calculateNativePriceBook({configurationVersion:1,product:"erp",modules:["erp-core"],addons:[],customModuleTier:["focused-module","business-module","advanced-module"],customSoftwareTier:null,customNotes:""},book);assert.equal(tiers.estimatedTotal,schedule.modules["erp-core"]+Object.values(schedule.customModules).reduce((sum,v)=>sum+v,0));
  for(const[tier,amount]of Object.entries(schedule.customSoftware)){const result=calculateNativePriceBook({configurationVersion:1,product:"custom",modules:[],addons:[],customModuleTier:[],customSoftwareTier:tier,customNotes:""},book);assert.equal(result.estimatedTotal,amount);assert.equal(result.hasStartingFromItems,true);}
 }
});
