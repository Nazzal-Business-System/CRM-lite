import assert from "node:assert/strict";
import test, {type TestContext} from "node:test";
import express from "express";
import type {AddressInfo} from "node:net";
import {PERMISSION_KEYS as P, type AuthUser} from "@nbs/shared";
import {env} from "../env";
import {prisma} from "../lib/prisma";
import {marketContext,marketRequestContext} from "../lib/market-context";
import {installMarketStore} from "../test/market-store";
import {publishedPriceBook} from "../pricing/price-books";
import {archivePricingEstimate,createPricingEstimate,copyPricingEstimate,getPricingEstimate,listPricingEstimates} from "./pricing-estimates.service";
import {pricingRouter} from "../routes/pricing";
import {errorHandler} from "../middleware/error-handler";
const actor=(id="partner",extra:string[]=[])=>({id,permissions:[P.PRICING_VIEW,P.PRICING_ESTIMATES_CREATE,P.COMPANIES_VIEW,...extra],role:{id:id==="admin"?"admin-role":"sales-role",name:id==="admin"?"Admin":"Sales",isSystem:true}} as AuthUser);
const run=<T>(who:AuthUser,work:()=>T)=>marketContext.run({actor:()=>who},work);
const book=publishedPriceBook("JO");
const input={title:"Immutable fixture",notes:"",companyId:null,priceBook:{id:"JO",version:book.version,structureVersion:book.structureVersion},configuration:{configurationVersion:1,product:"erp",modules:["erp-core"],addons:[],customModuleTier:[],customSoftwareTier:null,customNotes:""}};
function setup(t:TestContext){assert.equal(new URL(env.DATABASE_URL).port,"1");const previous=env.PRICING_MODE;env.PRICING_MODE="price_books";t.after(()=>{env.PRICING_MODE=previous;});const f=installMarketStore(t);for(const id of ["partner","admin"])f.tables.priceBookGrant!.push({userId:id,bookId:"JO",assignedByUserId:"admin"});return f;}
test("creator-only archive preserves snapshots and bindings, audits atomically, hides every normal read/copy and rejects alternate delegates",async t=>{
 const f=setup(t),who=actor();const saved=await run(who,()=>createPricingEstimate(input));
 const original=structuredClone(f.tables.pricingEstimate),bindings=structuredClone(f.tables.pricingEstimateBook);
 await assert.rejects(run(actor("admin",[P.PRICING_ESTIMATES_VIEW_ALL]),()=>archivePricingEstimate(saved.id)),{status:404});
 await assert.rejects(run({...who,permissions:[P.PRICING_VIEW]},()=>archivePricingEstimate(saved.id)),{status:403});
 await assert.rejects(run(who,()=>prisma.pricingEstimateArchive.create({data:{estimateId:saved.id,archivedById:who.id}})),{status:403});
 assert.deepEqual(await run(who,()=>archivePricingEstimate(saved.id)),{id:saved.id,archived:true});
 assert.deepEqual(f.tables.pricingEstimate,original);assert.deepEqual(f.tables.pricingEstimateBook,bindings);
 assert.equal(f.tables.auditLog!.at(-1)?.action,"PRICING_ESTIMATE_ARCHIVED");
 for(const reader of [who,actor("admin",[P.PRICING_ESTIMATES_VIEW_ALL])]){
  await assert.rejects(run(reader,()=>getPricingEstimate(saved.id)),{status:404});
  await assert.rejects(run(reader,()=>copyPricingEstimate(saved.id,input)),{status:404});
  assert.equal((await run(reader,()=>listPricingEstimates({page:1,pageSize:20,search:"",scope:"all"}))).total,0);
 }
 await assert.rejects(run(who,()=>archivePricingEstimate(saved.id)),{status:404});
 await assert.rejects(run(who,()=>prisma.pricingEstimate.findMany({include:{archive:true}})),{status:403});
});
test("archive rechecks company and book access, rolls back on audit failure and preserves 503 outages",async t=>{
 const f=setup(t),who=actor();const saved=await run(who,()=>createPricingEstimate({...input,companyId:"c0"}));
 const memberships=structuredClone(f.tables.userSalesMarket!);f.tables.userSalesMarket=[];
 await assert.rejects(run(who,()=>archivePricingEstimate(saved.id)),{status:404});f.tables.userSalesMarket=memberships;
 const grants=structuredClone(f.tables.priceBookGrant!);f.tables.priceBookGrant=[];
 await assert.rejects(run(who,()=>archivePricingEstimate(saved.id)),{status:404});f.tables.priceBookGrant=grants;
 f.setAuditOutage(true);await assert.rejects(run(who,()=>archivePricingEstimate(saved.id)));assert.equal(f.tables.pricingEstimateArchive!.length,0);f.setAuditOutage(false);
 f.setOutage(true);await assert.rejects(run(who,()=>archivePricingEstimate(saved.id)),{status:503});f.setOutage(false);
 assert.ok(await run(who,()=>getPricingEstimate(saved.id)));
});
test("DELETE estimate API enforces pricing permission/creator and returns 404 after archive without clearing authentication",async t=>{
 const f=setup(t);let who:AuthUser|undefined=actor();const saved=await run(who,()=>createPricingEstimate(input));
 const app=express();app.use(express.json(),marketRequestContext,(req,_res,next)=>{req.authUser=who;next();});app.use("/pricing",pricingRouter);app.use(errorHandler);
 const server=app.listen(0,"127.0.0.1");await new Promise<void>(r=>server.once("listening",r));t.after(()=>new Promise<void>(r=>server.close(()=>r())));
 const path="http://127.0.0.1:"+(server.address() as AddressInfo).port+"/pricing/estimates/"+saved.id;
 const send=(method="DELETE")=>fetch(path,{method});who=undefined;assert.equal((await send()).status,401);
 who={...actor(),permissions:[P.PRICING_VIEW]};assert.equal((await send()).status,403);
 who=actor("admin",[P.PRICING_ESTIMATES_VIEW_ALL]);assert.equal((await send()).status,404);
 who=actor();f.setOutage(true);const outage=await send();assert.equal(outage.status,503);assert.equal(outage.headers.get("set-cookie"),null);f.setOutage(false);
 const response=await send();assert.equal(response.status,200);assert.equal(response.headers.get("set-cookie"),null);assert.equal((await send("GET")).status,404);assert.equal((await send()).status,404);
});
test("archiving retained FX estimates never converts, relabels or overwrites historical amounts",async t=>{
 const f=setup(t);const historical={id:"historical-fx",createdById:"partner",companyId:null,title:"Retained historical conversion",notes:"",currency:"JOD",catalogVersion:book.version,calculationVersion:"cheapest-preset-v1",configurationVersion:1,selection:{...input.configuration,catalogVersion:book.version},result:{currency:"JOD",estimatedTotal:750,conversion:{exchange:{currency:"GBP",rate:1.1,source:"Historical fixture",effectiveDate:"2026-11-01"},result:{currency:"GBP",estimatedTotal:825}}},createdAt:new Date("2026-11-01")};
 f.tables.pricingEstimate!.push(structuredClone(historical));
 await run(actor(),()=>archivePricingEstimate(historical.id));assert.deepEqual(f.tables.pricingEstimate![0],historical);assert.equal(f.tables.pricingEstimateBook!.length,0);assert.equal(f.tables.pricingEstimateArchive!.length,1);
 await assert.rejects(run(actor(),()=>getPricingEstimate(historical.id)),{status:404});
});
