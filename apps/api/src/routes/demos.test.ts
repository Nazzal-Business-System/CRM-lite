import assert from "node:assert/strict";
import test from "node:test";
import type { AddressInfo } from "node:net";
import { PERMISSION_KEYS as P, demoResponseSchema } from "@nbs/shared";
import { createApp } from "../app";
import { env } from "../env";
import { sessionStore } from "../test/session-store";
import { createLoginSession } from "../services/sessions.service";
import { liveDemos } from "../config/demos";
const assertNoDestinations = (body: string) => { for (const item of [...liveDemos.demos, ...liveDemos.resources]) assert.ok(!body.includes(new URL(item.url).hostname)); };
test("demo discovery requires explicit permission for Admin/partners, hides destinations on denial and preserves sessions on outages", async t => {
  assert.equal(new URL(env.DATABASE_URL).hostname, "127.0.0.1"); assert.equal(new URL(env.DATABASE_URL).port, "1");
  const store = sessionStore(t); const session = await createLoginSession(store.user.id, store.user.passwordHash);
  const server = createApp().listen(0, "127.0.0.1"); await new Promise<void>(resolve => server.once("listening", resolve)); t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/demos`;
  const send = (auth = true) => fetch(url, { headers: auth ? { cookie: `${env.COOKIE_NAME}=${session.token}` } : {} });
  const unauthenticated = await send(false); assert.equal(unauthenticated.status, 401); assertNoDestinations(await unauthenticated.text());
  for (const name of ["Admin", "Sales Partner"]) {
    store.setUser({ role: { ...store.user.role, name, isSystem: true, permissions: [] } });
    const denied = await send(); assert.equal(denied.status, 403); assertNoDestinations(await denied.text());
    store.setUser({ role: { ...store.user.role, permissions: [{ roleId: "role", permissionId: "demos", permission: { id: "demos", key: P.DEMOS_VIEW, category: "Demos", description: "fixture" } }] } });
    const allowed = await send(); assert.equal(allowed.status, 200); assert.equal(allowed.headers.get("cache-control"), "no-store");
    assert.deepEqual(demoResponseSchema.parse((await allowed.json() as { data: unknown }).data), liveDemos);
  }
  store.setOutage(true); const outage = await send(); assert.equal(outage.status, 503); assert.equal(outage.headers.get("set-cookie"), null);
  store.setOutage(false); assert.equal((await send()).status, 200);
  assert.deepEqual(liveDemos.demos.map(item => item.url), ["https://erp-demo.nazzalbs.com", "https://pos-demo.nazzalbs.com", "https://ims-demo.nazzalbs.com"]);
  assert.deepEqual(liveDemos.resources, [{ id: "website", url: "https://www.nazzalbs.com" }]);
  assert.equal(liveDemos.demos.length, 3);
  for (const url of ["javascript:alert(1)", "http://example.invalid", "https://user:secret@example.invalid/"]) assert.equal(demoResponseSchema.safeParse({ demos: [{ id: "erp", url }], resources: [] }).success, false);
});
