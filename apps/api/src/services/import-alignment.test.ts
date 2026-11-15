import assert from "node:assert/strict";
import test from "node:test";
import ExcelJS from "exceljs";
import {parse} from "csv-parse/sync";
import {COMPANY_IMPORT_COLUMNS,CONTACT_IMPORT_COLUMNS,type AuthUser} from "@nbs/shared";
import {env} from "../env";
import {marketContext} from "../lib/market-context";
import {installMarketStore} from "../test/market-store";
import {buildTemplateWorkbook,buildTemplateCsv,buildImportPrompt,parseImportFile,commitImport} from "./imports.service";
const actor={id:"partner",role:{id:"sales-role",name:"Sales",isSystem:true},permissions:["imports.view","imports.create","companies.view","contacts.view"]} as AuthUser;
const run=<T>(work:()=>T)=>marketContext.run({actor:()=>actor},work);
const csv=(headers:readonly string[],rows:string[][])=>Buffer.from(headers.join(",")+"\n"+rows.map(row=>row.map(v=>'"'+v.replaceAll('"','""')+'"').join(",")).join("\n"));
const noBusinessWrites=(calls:Array<{operation:string}>)=>calls.every(c=>!["create","update","createMany","delete","upsert"].includes(c.operation));
test("downloaded CSV/XLSX and prompts use identical authoritative headers; company dropdowns/prompts expose only assigned markets",async t=>{
 assert.equal(new URL(env.DATABASE_URL).port,"1");const f=installMarketStore(t);
 for(const[entity,headers]of [["COMPANIES",COMPANY_IMPORT_COLUMNS],["CONTACTS",CONTACT_IMPORT_COLUMNS]] as const){
  const raw=buildTemplateCsv(entity);assert.deepEqual((parse(raw,{bom:true}) as string[][])[0],headers);
  const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(await run(()=>buildTemplateWorkbook(entity)) as unknown as ExcelJS.Buffer);
  assert.deepEqual((workbook.worksheets[0]!.getRow(1).values as unknown[]).slice(1),headers);
  const prompt=await run(()=>buildImportPrompt(entity));assert.ok(prompt.includes(headers.join(" | ")));
  if(entity==="COMPANIES"){
   assert.ok(prompt.includes("JO, US"));assert.ok(!prompt.includes("JO, UK, US or OTHER"));assert.ok(prompt.includes("Never default to Jordan"));
   const references=workbook.getWorksheet("Territory codes")!;assert.deepEqual([references.getCell(1,2).value,references.getCell(2,2).value,references.getCell(3,2).value],["JO","US",null]);
   const marketCol=headers.indexOf("Sales Market")+1;assert.deepEqual(workbook.worksheets[0]!.getCell(2,marketCol).dataValidation.formulae,["SalesMarkets"]);
  }else{assert.ok(prompt.includes("exactly one company visible"));assert.ok(prompt.includes("Do not invent emails"));}
 }
 assert.ok(noBusinessWrites(f.calls));
});
test("company preview is read-only, row-validates old templates and market/owner access; commit rechecks memberships without implicit Jordan",async t=>{
 const f=installMarketStore(t);
 const preview=await run(()=>parseImportFile("COMPANIES","fixture.csv",csv(["Company Name","Country Code","Sales Market","Owner Email"],[["Allowed","GB","JO",""],["Forbidden","GB","UK",""],["Missing","JO","",""],["Wrong owner","JO","JO","uk@fixture.invalid"]])));
 assert.notEqual(preview.rows[0]!.status,"INVALID");assert.deepEqual(preview.rows.slice(1).map(r=>r.status),["INVALID","INVALID","INVALID"]);assert.ok(preview.rows[1]!.messages.join().includes("Sales Market"));assert.ok(noBusinessWrites(f.calls));
 const old=await run(()=>parseImportFile("COMPANIES","old.csv",Buffer.from("Company Name\nLegacy input\n")));assert.equal(old.rows[0]!.included,false);
 const workbook=new ExcelJS.Workbook(),sheet=workbook.addWorksheet("Companies");sheet.addRow(["Company Name","Country Code","Sales Market"]);sheet.addRow(["Allowed XLSX","GB","JO"]);
 const xlsx=Buffer.from(await workbook.xlsx.writeBuffer());assert.notEqual((await run(()=>parseImportFile("COMPANIES","fixture.xlsx",xlsx))).rows[0]!.status,"INVALID");
 const protectedRows=structuredClone(f.tables.company);f.tables.userSalesMarket=f.tables.userSalesMarket!.filter(m=>m.marketCode!=="JO");
 const result=await run(()=>commitImport("COMPANIES",{entity:"COMPANIES",rows:[{rowNumber:1,included:true,values:preview.rows[0]!.values}]},actor));
 assert.equal(result.created,0);assert.equal(result.invalid,1);assert.equal(result.errors[0]!.rowNumber,1);assert.deepEqual(f.tables.company,protectedRows);
});
test("contacts keep exact scoped company linking, reject ambiguous/hidden associations, validate Primary and skip name/email duplicates",async t=>{
 const f=installMarketStore(t);const headers=["Company Name","Name","Email","Primary"];
 const preview=await run(()=>parseImportFile("CONTACTS","fixture.csv",csv(headers,[["Company 0","New person","known@fixture.invalid","Yes"],["Company 0","New person","different@fixture.invalid",""],["Company 1","Hidden person","",""],["Company 0","Invalid primary","","maybe"]])));
 assert.equal(preview.rows[0]!.status,"READY");assert.equal(preview.rows[1]!.status,"WARNING");assert.ok(preview.rows[1]!.messages.join().includes("Duplicate"));assert.equal(preview.rows[2]!.status,"INVALID");assert.equal(preview.rows[3]!.status,"INVALID");assert.ok(noBusinessWrites(f.calls));
 const result=await run(()=>commitImport("CONTACTS",{entity:"CONTACTS",rows:preview.rows.map(r=>({rowNumber:r.rowNumber,included:true,values:r.values}))},actor));
 assert.equal(result.created,1);assert.equal(result.duplicates,1);assert.equal(result.invalid,2);assert.equal(f.tables.contact!.at(-1)!.companyId,"c0");assert.equal(f.tables.contact!.at(-1)!.isPrimary,true);
 f.tables.company!.push({...f.tables.company![0],id:"ambiguous",salesMarketCode:"US"});
 const ambiguous=await run(()=>parseImportFile("CONTACTS","ambiguous.csv",csv(headers,[["Company 0","No guessed company","",""]])));assert.equal(ambiguous.rows[0]!.included,false);assert.ok(ambiguous.rows[0]!.messages.join().includes("exactly one accessible company"));
 const before=structuredClone(f.tables.contact);const rejected=await run(()=>commitImport("CONTACTS",{entity:"CONTACTS",rows:[{rowNumber:1,included:true,values:ambiguous.rows[0]!.values}]},actor));assert.equal(rejected.created,0);assert.deepEqual(f.tables.contact,before);
});
test("recognized duplicate headers fail explicitly rather than overwriting data; safe header aliases remain compatible",async t=>{
 installMarketStore(t);
 await assert.rejects(run(()=>parseImportFile("COMPANIES","duplicate.csv",Buffer.from("Company Name,Country Code,Country_Code,Sales Market\nName,JO,US,JO\n"))),/Duplicate recognized column/);
 const preview=await run(()=>parseImportFile("COMPANIES","aliases.csv",Buffer.from("company_name,country_code,sales_market\nAliases,US,JO\n")));assert.notEqual(preview.rows[0]!.status,"INVALID");assert.equal(preview.rows[0]!.values["Country Code"],"US");
});
