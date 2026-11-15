import assert from "node:assert/strict";
import test from "node:test";
import { demoResponseSchema, PERMISSION_KEYS as P, type AuthUser } from "@nbs/shared";
import { QueryClient } from "@tanstack/react-query";
import { canViewDemos, demoQueryOptions } from "./demos";
import { visibleNavSections } from "./navigation";
import { enMessages } from "../i18n/messages/en";
import { arMessages } from "../i18n/messages/ar";
const actor = (permissions: string[], id = "fixture") => ({ id, permissions } as AuthUser);
test("demo navigation and data fetch require explicit permission and isolate actor caches", async t => {
  let requests = 0; t.mock.method(globalThis, "fetch", async () => { requests++; return Response.json({ data: { demos: [], resources: [] } }); });
  const visible = (permissions: string[]) => visibleNavSections(permissions).flatMap(section => section.items).some(item => item.href === "/demos");
  assert.equal(visible([P.PRICING_VIEW]), false); assert.equal(visible([P.DEMOS_VIEW]), true); assert.equal(canViewDemos(null), false);
  await assert.rejects(demoQueryOptions(actor([])).queryFn(), { status: 403 }); assert.equal(requests, 0);
  assert.deepEqual(await demoQueryOptions(actor([P.DEMOS_VIEW])).queryFn(), { demos: [], resources: [] });
  assert.notDeepEqual(demoQueryOptions(actor([P.DEMOS_VIEW])).queryKey, demoQueryOptions(actor([P.DEMOS_VIEW], "other")).queryKey);
  assert.notDeepEqual(demoQueryOptions(actor([])).queryKey, demoQueryOptions(actor([P.DEMOS_VIEW])).queryKey);
});
test("demo outages preserve authentication and malformed destinations are rejected", async t => {
  const client = new QueryClient(); t.after(() => client.clear()); const user = actor([P.DEMOS_VIEW]); client.setQueryData(["auth", "me"], user);
  t.mock.method(globalThis, "fetch", async () => Response.json({ error: { code: "SERVICE_UNAVAILABLE" } }, { status: 503 }));
  await assert.rejects(demoQueryOptions(user).queryFn(), { status: 503 }); assert.deepEqual(client.getQueryData(["auth", "me"]), user); t.mock.restoreAll();
  t.mock.method(globalThis, "fetch", async () => Response.json({ data: { demos: [{ id: "erp", url: "javascript:alert(1)" }], resources: [] } }));
  await assert.rejects(demoQueryOptions(user).queryFn());
});
test("demo translations cover the same EN/AR fields and role category", () => {
  const paths = (value: object, prefix = ""): string[] => Object.entries(value).flatMap(([key, item]) => typeof item === "string" ? [prefix + key] : paths(item, prefix + key + "."));
  assert.deepEqual(paths(enMessages.demos).sort(), paths(arMessages.demos).sort()); assert.ok(arMessages.roles.permissions.demos);
});

test("website is a separate reference resource; duplicate demos and unsafe reference links are rejected", async t => {
  const duplicate = { id: "erp", url: "https://erp-demo.nazzalbs.com" };
  assert.equal(demoResponseSchema.safeParse({ demos: [duplicate, duplicate], resources: [] }).success, false);
  const user = actor([P.DEMOS_VIEW]);
  t.mock.method(globalThis, "fetch", async () => Response.json({ data: { demos: [{ id: "erp", url: "https://erp-demo.nazzalbs.com" }], resources: [{ id: "website", url: "https://www.nazzalbs.com" }] } }));
  const result = await demoQueryOptions(user).queryFn(); assert.equal(result.demos.length, 1); assert.equal(result.resources[0].id, "website"); t.mock.restoreAll();
  for (const resources of [[{ id: "website", url: "javascript:alert(1)" }], [{ id: "erp", url: "https://www.nazzalbs.com" }]]) {
    t.mock.method(globalThis, "fetch", async () => Response.json({ data: { demos: [], resources } })); await assert.rejects(demoQueryOptions(user).queryFn()); t.mock.restoreAll();
  }
});
