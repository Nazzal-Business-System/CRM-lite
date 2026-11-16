import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

test("shared partner modal form renders create/edit, localized fields and safe compatibility routes without a browser", () => {
  const root = fileURLToPath(new URL("../../../../", import.meta.url));
  const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-"], { cwd: root, encoding: "utf8", env: { ...process.env, TSX_TSCONFIG_PATH: "apps/web/tsconfig.json" }, input: `
    import assert from 'node:assert/strict';
    import {createElement as h} from 'react';
    import {renderToStaticMarkup} from 'react-dom/server';
    import {createRequire} from 'node:module';
    const require=createRequire(import.meta.url);
    const {AppRouterContext}=require('next/dist/shared/lib/app-router-context.shared-runtime');
    const {QueryClient,QueryClientProvider}=require('@tanstack/react-query');
    import {I18nProvider} from './apps/web/src/i18n/provider.tsx';
    import {AuthProvider} from './apps/web/src/providers/auth-provider.tsx';
    import {PartnerFormView} from './apps/web/src/components/users/partner-editor.tsx';
    import {PartnerPriceBookFields} from './apps/web/src/components/users/partner-price-book-fields.tsx';
    import {partnerActorKey} from './apps/web/src/lib/partners.ts';
    import {INITIAL_SALES_MARKETS,PERMISSION_KEYS as P} from '@nbs/shared';
    import NewPage from './apps/web/src/app/(app)/admin/users/new/page.tsx';
    import EditPage from './apps/web/src/app/(app)/admin/users/[id]/page.tsx';
    import UsersPage from './apps/web/src/app/(app)/admin/users/page.tsx';
    const viewer={id:'admin',name:'Admin',permissions:[P.USERS_VIEW,P.USERS_CREATE,P.USERS_UPDATE,P.MARKETS_MANAGE_MEMBERSHIPS],role:{id:'admin-role',name:'Admin',isSystem:true}};
    const target={id:'partner',name:'Fixture Partner',email:'fixture@example.invalid',accountType:'PARTNER',role:{id:'sales',name:'Sales',isSystem:true},marketCodes:['JO','UK'],defaultMarketCode:'UK'};
    const router={replace(){},push(){},refresh(){},back(){},forward(){},prefetch(){}};
    for(const locale of ['en','ar']){
      globalThis.window={localStorage:{getItem:()=>locale}};
      const client=new QueryClient({defaultOptions:{queries:{retry:false,staleTime:Infinity}}});
      client.setQueryData(['auth','me'],viewer);
      client.setQueryData(['role-options',...partnerActorKey(viewer)],{roles:[viewer.role,target.role]});
      client.setQueryData(['managed-sales-markets','admin'],{markets:[...INITIAL_SALES_MARKETS]});
      const render=props=>renderToStaticMarkup(h(AppRouterContext.Provider,{value:router},h(QueryClientProvider,{client},h(I18nProvider,null,h(AuthProvider,null,h(PartnerFormView,{internal:false,onGuardChange(){},onCancel(){},onSaved(){},...props}))))));
      const create=render({});const edit=render({target});
      const bookFields=value=>renderToStaticMarkup(h(I18nProvider,null,h(PartnerPriceBookFields,{value,disabled:false,pricingEnabled:true,onChange(){}})));
      const emptyBooks=bookFields({scope:'selected',bookIds:[],defaultBookId:null});
      const assignedBooks=bookFields({scope:'selected',bookIds:['JO'],defaultBookId:'JO'});
      const invalidDefault=bookFields({scope:'selected',bookIds:['JO'],defaultBookId:null});
      assert.ok(emptyBooks.includes('role="status"'));
      assert.ok(invalidDefault.includes('role="alert"'));
      for(const markup of [emptyBooks,assignedBooks]) {
        assert.ok(!markup.includes('partners.'));
        assert.ok(markup.includes('sm:grid-cols-3'));
        assert.ok(markup.includes('dir="'+(locale==='ar'?'rtl':'ltr')+'"'));
        for(const currency of ['JOD','USD','GBP']) assert.ok(markup.includes(currency));
        assert.ok(markup.includes('partner-price-book-default'));
      }
      for(const markup of [create,edit]){
        assert.equal((markup.match(/<form/g)||[]).length,1);
        assert.ok(markup.includes('overflow-y-auto'));assert.ok(markup.includes('min-h-0'));assert.ok(markup.includes('sm:grid-cols-2'));
        assert.ok(markup.includes('aria-busy="false"'));assert.ok(markup.includes('type="submit"'));assert.ok(markup.includes('dir="'+(locale==='ar'?'rtl':'ltr')+'"'));
        assert.ok(!markup.includes('partners.'));assert.ok(!markup.includes('href="/admin/users"'));
        for(const id of ['partner-name','partner-email','partner-password','partner-kind','partner-role','partner-default'])assert.ok(markup.includes('for="'+id+'"'));
      }
      const password=markup=>markup.match(/<input[^>]*id="partner-password"[^>]*>/)[0];
      assert.ok(password(create).includes('required=""'));assert.ok(!password(edit).includes('required=""'));
      assert.ok(password(edit).includes('value=""'));assert.ok(edit.includes('GBP'));assert.ok(edit.includes('Fixture Partner'));
      assert.ok(create.includes(locale==='ar'?'معلومات الحساب':'Account information'));
      assert.ok(edit.includes(locale==='ar'?'حفظ التغييرات':'Save changes'));
      client.clear();delete globalThis.window;
    }
    for(const [page,args,url]of [[NewPage,{searchParams:Promise.resolve({})},'/admin/users?create=partner'],[NewPage,{searchParams:Promise.resolve({type:'internal'})},'/admin/users?create=internal'],[EditPage,{params:Promise.resolve({id:'partner/id'})},'/admin/users?edit=partner%2Fid']]){
      await assert.rejects((typeof page==='function'?page:page.default)(args),error=>error.digest==='NEXT_REDIRECT;replace;'+url+';307;');
    }
    for(const [params,expected]of [[{create:'partner'},{mode:'create',internal:false}],[{create:'internal'},{mode:'create',internal:true}],[{edit:'partner'},{mode:'edit',id:'partner'}],[{},null]]){
      const page=await (typeof UsersPage==='function'?UsersPage:UsersPage.default)({searchParams:Promise.resolve(params)});assert.deepEqual(page.props.children.props.initialEditor,expected);
    }
  ` });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
