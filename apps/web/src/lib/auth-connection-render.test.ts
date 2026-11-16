import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

test("initial connection and retry screens render accessible EN/AR content without protected children", () => {
  const root = fileURLToPath(new URL("../../../../", import.meta.url));
  const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-"], {
    cwd: root, encoding: "utf8", env: { ...process.env, TSX_TSCONFIG_PATH: "apps/web/tsconfig.json" },
    input: `
      import assert from 'node:assert/strict';
      import {createElement as h} from 'react';
      import {renderToStaticMarkup} from 'react-dom/server';
      import {I18nProvider} from './apps/web/src/i18n/provider.tsx';
      import {AuthConnectionState} from './apps/web/src/components/auth-connection-state.tsx';
      for (const locale of ['en','ar']) {
        globalThis.window={localStorage:{getItem:()=>locale}};
        const render=failed=>renderToStaticMarkup(h(I18nProvider,null,h(AuthConnectionState,{failed,retry:()=>{}})));
        const pending=render(false);
        const failed=render(true);
        assert.match(pending,/role="status"/);
        assert.match(pending,/aria-live="polite"/);
        assert.match(pending,locale==='ar'?/جارٍ الاتصال/:/Connecting to CRM/);
        assert.match(pending,locale==='ar'?/dir="rtl"/:/dir="ltr"/);
        assert.match(failed,/role="alert"/);
        assert.match(failed,locale==='ar'?/إعادة المحاولة/:/Retry/);
        assert.match(pending,/max-w-md/);
        assert.doesNotMatch(pending,/companies|pricing|dashboard/);
      }
    `,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
