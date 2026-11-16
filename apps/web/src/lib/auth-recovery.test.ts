import assert from "node:assert/strict";
import test from "node:test";
import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "./api";
import { authQueryOptions, subscribeAuthRevalidation } from "./auth-query";
import { AUTH_RECOVERY_WINDOW_MS, isTransientAuthFailure, recoverAuthIdentity } from "./auth-recovery";

const fast = { windowMs: 180, requestMs: 15, backoffMs: [1, 2, 4] };
const outage = () => new ApiError(503, "SERVICE_UNAVAILABLE", "warming up");

test("slow cold start retries serial timed-out requests and recovers automatically", async () => {
  let attempts = 0;
  let active = 0;
  let peak = 0;
  const result = await recoverAuthIdentity(async (signal) => {
    attempts++;
    active++;
    peak = Math.max(peak, active);
    if (attempts < 4) {
      return new Promise<never>((_, reject) => signal.addEventListener("abort", () => { active--; reject(signal.reason); }, { once: true }));
    }
    active--;
    return { id: "verified" };
  }, new AbortController().signal, fast);
  assert.equal(result.id, "verified");
  assert.equal(attempts, 4);
  assert.equal(peak, 1);
  assert.equal(AUTH_RECOVERY_WINDOW_MS, 120_000);
});

test("persistent outage is bounded, uses backoff, and manual retry has a fresh cycle", async () => {
  let attempts = 0;
  const read = async () => { attempts++; throw outage(); };
  const policy = { windowMs: 45, requestMs: 10, backoffMs: [5, 10, 15] };
  await assert.rejects(recoverAuthIdentity(read, new AbortController().signal, policy), ApiError);
  const previous = attempts;
  assert.ok(previous >= 2 && previous < 10);
  assert.equal(await recoverAuthIdentity(async () => "restored", new AbortController().signal, policy), "restored");
  await assert.rejects(recoverAuthIdentity(read, new AbortController().signal, policy));
  assert.ok(attempts > previous);
});

test("only transient failures retry; structured confirmed 401 ends verification without retry", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    return Response.json({ error: { code: "UNAUTHENTICATED" } }, { status: 401 });
  });
  const client = new QueryClient();
  t.after(() => client.clear());
  assert.equal(await client.fetchQuery(authQueryOptions), null);
  assert.equal(calls, 1);
  for (const status of [401, 403, 404]) {
    const error = new ApiError(status, "REQUEST_FAILED", "not confirmed");
    assert.equal(isTransientAuthFailure(error), false);
    let attempts = 0;
    await assert.rejects(recoverAuthIdentity(async () => { attempts++; throw error; }, new AbortController().signal, fast));
    assert.equal(attempts, 1);
  }
  for (const status of [500, 502, 503, 504]) assert.equal(isTransientAuthFailure(new ApiError(status, "UPSTREAM", "temporary")), true);
});

test("cancellation aborts pending body reads/backoff and never starts another attempt", async () => {
  const controller = new AbortController();
  let calls = 0;
  const pending = recoverAuthIdentity(async () => { calls++; throw outage(); }, controller.signal, fast);
  controller.abort();
  await assert.rejects(pending);
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(calls, 1);
});

test("concurrent identity consumers share a cycle; recovery refreshes dependent queries once", async (t) => {
  const client = new QueryClient();
  t.after(() => client.clear());
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    if (calls === 1) throw new TypeError("offline");
    return Response.json({ data: { user: { id: "recovered" } } });
  });
  client.setQueryData(["companies"], ["cached"]);
  const results = await Promise.all([client.fetchQuery(authQueryOptions), client.fetchQuery(authQueryOptions)]);
  assert.equal(calls, 2);
  assert.deepEqual(results[0], results[1]);
  assert.equal(client.getQueryState(["companies"])?.isInvalidated, true);
});

test("online/visibility recovery deduplicates active cycles and cleans up all handlers", (t) => {
  const client = new QueryClient();
  t.after(() => client.clear());
  client.setQueryData(authQueryOptions.queryKey, { id: "verified" });
  const query = client.getQueryCache().find({ queryKey: authQueryOptions.queryKey })!;
  query.setState({ status: "error", fetchStatus: "idle" });
  const win = new EventTarget();
  const doc = Object.assign(new EventTarget(), { visibilityState: "visible" });
  let online = false;
  let cycles = 0;
  t.mock.method(client, "invalidateQueries", async () => { cycles++; query.setState({ fetchStatus: "fetching" }); });
  const cleanup = subscribeAuthRevalidation(client, { window: win, document: doc, isOnline: () => online });
  win.dispatchEvent(new Event("nbs:auth-revalidate"));
  doc.dispatchEvent(new Event("visibilitychange"));
  assert.equal(cycles, 0, "offline visibility/resource errors do not restart an exhausted cycle");
  online = true;
  win.dispatchEvent(new Event("online"));
  doc.dispatchEvent(new Event("visibilitychange"));
  win.dispatchEvent(new Event("nbs:auth-revalidate"));
  assert.equal(cycles, 1, "browser events cannot cancel or duplicate an active cycle");
  assert.equal(client.getQueryData<{ id: string }>(authQueryOptions.queryKey)?.id, "verified");
  query.setState({ fetchStatus: "idle" });
  win.dispatchEvent(new Event("online"));
  doc.dispatchEvent(new Event("visibilitychange"));
  assert.equal(cycles, 1, "rapid recovery events remain throttled after completion");
  cleanup();
  win.dispatchEvent(new Event("online"));
  doc.dispatchEvent(new Event("visibilitychange"));
  win.dispatchEvent(new Event("nbs:auth-revalidate"));
  assert.equal(cycles, 1);
});

test("healthy revalidation does not repeatedly refresh failing resource queries", async (t) => {
  const client = new QueryClient();
  t.after(() => client.clear());
  client.setQueryData(["companies"], ["cached"]);
  t.mock.method(globalThis, "fetch", async () => Response.json({ data: { user: { id: "verified" } } }));
  await client.fetchQuery(authQueryOptions);
  assert.equal(client.getQueryState(["companies"])?.isInvalidated, false);
});
