import assert from "node:assert/strict";
import test from "node:test";
import { MutationObserver, QueryClient } from "@tanstack/react-query";
import type { AdminSessionSummary } from "@nbs/shared";
import { sessionDateBoundary, sessionRevocationOptions } from "./session-management";
import { authQueryOptions, clearCachedSession } from "./auth-query";
import { PERMISSION_KEYS } from "@nbs/shared";
import { visibleNavSections } from "./navigation";
import { enMessages } from "../i18n/messages/en";
import { arMessages } from "../i18n/messages/ar";

const session: AdminSessionSummary = {
  id: "session/one", isCurrent: true, isLegacy: false, status: "ACTIVE",
  device: { browser: "Chrome", operatingSystem: "Windows", type: "desktop" },
  createdAt: "2026-11-01T00:00:00Z", lastActivityAt: "2026-11-03T00:00:00Z",
  idleExpiresAt: "2026-11-10T00:00:00Z", absoluteExpiresAt: "2026-12-01T00:00:00Z", expiresAt: "2026-11-10T00:00:00Z", revokedAt: null,
  user: { id: "user/one", name: "Test", email: "test@example.invalid", isActive: true },
};
test("confirmed current-session revocation clears identity without another logout request", async (t) => {
  const client = new QueryClient(); t.after(() => client.clear());
  client.setQueryData(authQueryOptions.queryKey, { id: "verified" });
  client.setQueryData(["companies"], ["private"]);
  const calls: string[] = [];
  t.mock.method(globalThis, "fetch", async (path: string) => {
    calls.push(path); return Response.json({ data: { ok: true, revokedCount: 1, currentSessionRevoked: true } });
  });
  let redirects = 0;
  const mutation = new MutationObserver(client, sessionRevocationOptions(client, () => clearCachedSession(client, () => { redirects += 1; }), false));
  await mutation.mutate({ kind: "one", session });
  assert.deepEqual(calls, ["/api/auth/sessions/session%2Fone"]);
  assert.equal(client.getQueryData(authQueryOptions.queryKey), null);
  assert.equal(client.getQueryData(["companies"]), undefined);
  assert.equal(redirects, 1);
});
test("failed revocation preserves cached authentication and recovery refreshes listings", async (t) => {
  const client = new QueryClient(); t.after(() => client.clear());
  const identity = { id: "verified" }; client.setQueryData(authQueryOptions.queryKey, identity);
  client.setQueryData(["sessions", "mine"], { items: [session] });
  client.setQueryData(["audit-logs"], { items: [] });
  let offline = true; let endings = 0;
  t.mock.method(globalThis, "fetch", async () => offline ? Response.json({ error: { code: "SERVICE_UNAVAILABLE" } }, { status: 503 }) : Response.json({ data: { ok: true, revokedCount: 2, currentSessionRevoked: false } }));
  const mutation = new MutationObserver(client, sessionRevocationOptions(client, async () => { endings += 1; }, false));
  await assert.rejects(mutation.mutate({ kind: "others" }));
  assert.deepEqual(client.getQueryData(authQueryOptions.queryKey), identity);
  assert.equal(endings, 0);
  offline = false; await mutation.mutate({ kind: "others" });
  assert.equal(client.getQueryState(["sessions", "mine"])?.isInvalidated, true);
  assert.equal(client.getQueryState(["audit-logs"])?.isInvalidated, true);
  assert.deepEqual(client.getQueryData(authQueryOptions.queryKey), identity);
});
test("admin mutation binds the owner and navigation requires view rather than revoke", async (t) => {
  const client = new QueryClient(); t.after(() => client.clear()); const calls: string[] = [];
  t.mock.method(globalThis, "fetch", async (path: string) => { calls.push(path); return Response.json({ data: { ok: true, revokedCount: 1, currentSessionRevoked: false } }); });
  await new MutationObserver(client, sessionRevocationOptions(client, async () => {}, true)).mutate({ kind: "one", session });
  assert.deepEqual(calls, ["/api/admin/users/user%2Fone/sessions/session%2Fone"]);
  const visible = (keys: string[]) => visibleNavSections(keys).flatMap((section) => section.items).some((item) => item.href === "/admin/sessions");
  assert.equal(visible([]), false); assert.equal(visible([PERMISSION_KEYS.SESSIONS_REVOKE]), false); assert.equal(visible([PERMISSION_KEYS.SESSIONS_VIEW]), true);
});
test("date filters cover inclusive Amman business dates and translations match", () => {
  const from = sessionDateBoundary("2026-11-03")!; const to = sessionDateBoundary("2026-11-03", true)!;
  assert.equal(Date.parse(to) - Date.parse(from) + 1, 86_400_000);
  assert.equal(from, "2026-11-02T21:00:00.000Z");
  assert.equal(sessionDateBoundary(""), undefined);
  const paths = (value: object, prefix = ""): string[] => Object.entries(value).flatMap(([key, item]) => typeof item === "string" ? [prefix + key] : paths(item, prefix + key + "."));
  assert.deepEqual(paths(enMessages.sessions).sort(), paths(arMessages.sessions).sort());
});
