import assert from "node:assert/strict";
import test from "node:test";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";

test("compact company/contact previews preserve full values, readable EN/AR status, selection and accessible details",()=>{
  const result=spawnSync(process.execPath,["--import","tsx","--input-type=module","-"],{cwd:fileURLToPath(new URL("../../../../",import.meta.url)),encoding:"utf8",env:{...process.env,TSX_TSCONFIG_PATH:"apps/web/tsconfig.json"},input:`
    import assert from 'node:assert/strict';import{createElement as h}from'react';import{renderToStaticMarkup}from'react-dom/server';
    import{I18nProvider}from'./apps/web/src/i18n/provider.tsx';import{ImportPreviewTable,ImportPreviewRowDetails}from'./apps/web/src/components/imports/import-preview.tsx';
    import{COMPANY_IMPORT_COLUMNS,CONTACT_IMPORT_COLUMNS}from'@nbs/shared';
    const long='Long verified value '.repeat(80);
    for(const locale of ['en','ar'])for(const entity of ['COMPANIES','CONTACTS']){
      globalThis.window={localStorage:{getItem:()=>locale}};
      const columns=entity==='COMPANIES'?COMPANY_IMPORT_COLUMNS:CONTACT_IMPORT_COLUMNS;
      const values=Object.fromEntries(columns.map(column=>[column,column+': '+long]));values['Country Code']='GB';values['Sales Market']='UK';
      const rows=['READY','WARNING','INVALID'].map((status,index)=>({rowNumber:index+1,status,included:status!=='INVALID',values,messages:index?['First validation message','Full secondary detail']:[]}));
      const render=child=>renderToStaticMarkup(h(I18nProvider,null,child));
      const preview={entity,filename:'isolated.csv',rows,counts:{total:3,ready:1,warning:1,invalid:1}};
      const markup=render(h(ImportPreviewTable,{preview,busy:false,onInclude:()=>{}}));
      assert.ok(markup.includes('role="region"'));assert.ok(markup.includes('tabindex="0"'));assert.ok(markup.includes('dir="'+(locale==='ar'?'rtl':'ltr')+'"'));
      assert.ok(markup.includes('overflow-auto'));assert.ok(markup.includes('table-fixed'));assert.ok(markup.includes('truncate'));assert.ok(markup.includes('sticky top-0'));assert.ok(!markup.includes('break-words'));
      assert.equal((markup.match(/aria-expanded="false"/g)||[]).length,3);assert.equal((markup.match(/role="checkbox"/g)||[]).length,3);assert.ok(markup.includes('disabled=""'));
      assert.ok(!markup.includes('imports.'));assert.ok(markup.includes(locale==='ar'?'جاهز':'Ready'));assert.ok(markup.includes(locale==='ar'?'تحذير':'Warning'));assert.ok(markup.includes(locale==='ar'?'غير صالح':'Invalid'));
      assert.ok(markup.includes('Company Name: '+long));if(entity==='COMPANIES'){assert.ok(markup.includes('>GB<'));assert.ok(markup.includes('>UK<'));}
      const busy=render(h(ImportPreviewTable,{preview,busy:true,onInclude:()=>{}}));assert.equal((busy.match(/role="checkbox"[^>]*disabled=""/g)||[]).length,3);
      const detail=render(h(ImportPreviewRowDetails,{row:rows[1],entity}));assert.ok(detail.includes('Full secondary detail'));assert.ok(detail.includes('break-words'));assert.ok(detail.includes('sm:grid-cols-2'));
      for(const column of columns)assert.ok(detail.includes(values[column]),'missing full field '+column);
    }
  `});
  assert.equal(result.status,0,result.stderr||result.stdout);
});
