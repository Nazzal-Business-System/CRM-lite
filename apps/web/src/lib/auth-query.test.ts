import assert from "node:assert/strict";
import test from "node:test";
import { MutationObserver, QueryClient } from "@tanstack/react-query";
import { authQueryOptions, logoutMutationOptions } from "./auth-query";
import { api, ApiError } from "./api";

// Exercise the real query/cache behavior without waiting two minutes per outage.
const boundedOptions = {
  ...authQueryOptions,
  queryFn: (context: Parameters<typeof authQueryOptions.queryFn>[0]) => authQueryOptions.queryFn({
    ...context, signal: AbortSignal.any([context.signal, AbortSignal.timeout(25)]),
  }),
};

test("verified identity survives outages and is replaced only after recovery or confirmed 401", async (t) => {
  const client = new QueryClient();
  t.after(() => client.clear());
  const user = { id: "verified", permissions: ["companies.view"] };
  let response: Response | Error = Response.json({ data: { user } });
  t.mock.method(globalThis, "fetch", async () => {
    if (response instanceof Error) throw response;
    return response.clone();
  });
  const read = () => client.fetchQuery({ ...boundedOptions, staleTime: 0 });
  assert.deepEqual(await read(), user);
  for (const failure of [
    Response.json({ error: { code: "SERVICE_UNAVAILABLE" } }, { status: 503 }),
    new Response("upstream timeout", { status: 504 }),
    new Response("Internal Server Error", { status: 500 }),
    Response.json({ error: { code: "INTERNAL_ERROR" } }, { status: 500 }),
    new TypeError("network offline"),
    new DOMException("timeout", "TimeoutError"),
    new Response("upstream unauthorized", { status: 401 }),
  ]) {
    response = failure;
    await assert.rejects(read());
    assert.deepEqual(client.getQueryData(authQueryOptions.queryKey), user);
    assert.equal(client.getQueryState(authQueryOptions.queryKey)?.status, "error");
  }
  response = Response.json({ data: { user } });
  assert.deepEqual(await read(), user);
  assert.equal(client.getQueryState(authQueryOptions.queryKey)?.status, "success");
  response = Response.json({ error: { code: "UNAUTHENTICATED" } }, { status: 401 });
  assert.equal(await read(), null);
  assert.equal(client.getQueryData(authQueryOptions.queryKey), null);
});

test("ordinary requests revalidate without clearing identity; forbidden is not logout", async (t) => {
  const events: string[] = [];
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: { dispatchEvent: (event: Event) => { events.push(event.type); return true; } } });
  t.after(() => {
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
  });
  let status = 503;
  t.mock.method(globalThis, "fetch", async () => Response.json({ error: { code: status === 401 ? "UNAUTHENTICATED" : status === 403 ? "FORBIDDEN" : "SERVICE_UNAVAILABLE" } }, { status }));
  for (status of [503, 401]) {
    await assert.rejects(api.get("/companies"), ApiError);
    assert.equal(events.at(-1), "nbs:auth-revalidate");
  }
  const count = events.length;
  status = 403;
  await assert.rejects(api.get("/companies"), ApiError);
  assert.equal(events.length, count);
  assert.ok(!events.includes("nbs:unauthorized"));
});

test("initial outage remains unverified rather than signed out", async (t) => {
  const client = new QueryClient();
  t.after(() => client.clear());
  t.mock.method(globalThis, "fetch", async () => { throw new TypeError("offline"); });
  await assert.rejects(client.fetchQuery(boundedOptions));
  assert.equal(client.getQueryData(authQueryOptions.queryKey), undefined);
  assert.equal(client.getQueryState(authQueryOptions.queryKey)?.status, "error");
});

test("explicit logout clears identity and protected caches even during an outage", async (t) => {
  for (const unavailable of [false, true]) {
    const client = new QueryClient();
    client.setQueryData(authQueryOptions.queryKey, { id: "verified" });
    client.setQueryData(["companies"], [{ id: "private" }]);
    let redirects = 0;
    const fetchMock = t.mock.method(globalThis, "fetch", async () => {
      if (unavailable) throw new TypeError("offline");
      return Response.json({ data: { ok: true } });
    });
    const logout = new MutationObserver(client, logoutMutationOptions(client, () => { redirects += 1; }));
    if (unavailable) await assert.rejects(logout.mutate());
    else await logout.mutate();
    assert.equal(client.getQueryData(authQueryOptions.queryKey), null);
    assert.equal(client.getQueryData(["companies"]), undefined);
    assert.equal(redirects, 1);
    fetchMock.mock.restore();
    client.clear();
  }
});
