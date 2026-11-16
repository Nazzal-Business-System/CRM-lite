import type { QueryClient, QueryFunctionContext } from "@tanstack/react-query";
import type { AuthUser } from "@nbs/shared";
import { api, isConfirmedUnauthenticated } from "./api";
import { recoverAuthIdentity } from "./auth-recovery";

export const authQueryOptions = {
  queryKey: ["auth", "me"] as const,
  queryFn: async ({ signal, client }: QueryFunctionContext<readonly ["auth", "me"]>): Promise<AuthUser | null> => {
    const recovering = client.getQueryState(["auth", "me"])?.status === "error";
    let attempts = 0;
    const user = await recoverAuthIdentity(async (attemptSignal) => {
      attempts += 1;
      try {
        return (await api.get<{ user: AuthUser }>("/auth/me", { signal: attemptSignal })).user;
      } catch (error) {
        if (isConfirmedUnauthenticated(error)) return null;
        // Rejecting preserves previously verified identity in React Query.
        throw error;
      }
    }, signal);
    if (user && (recovering || attempts > 1)) {
      // Runs after identity verification, including automatic outage recovery.
      void client.invalidateQueries({ predicate: (query) => query.queryKey[0] !== "auth" });
    }
    return user;
  },
  retry: false as const, // The single query function owns the bounded recovery cycle.
  networkMode: "always" as const, // Offline time counts toward the recovery deadline.
  retryOnMount: false,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
  staleTime: 60_000,
};

export function subscribeAuthRevalidation(queryClient: QueryClient, browser: {
  window: EventTarget;
  document: EventTarget & { visibilityState: string };
  isOnline: () => boolean;
}) {
  let lastStartedAt = -Infinity;
  const revalidate = (recovery = false) => {
    const state = queryClient.getQueryState(authQueryOptions.queryKey);
    // Resource failures cannot restart an exhausted cycle; browser recovery and
    // manual retry can. An in-flight query always owns its existing deadline.
    if (!state || state.fetchStatus !== "idle" || state.data === null) return;
    if (state.status === "error" && !recovery) return;
    // Coalesce staggered resource errors and rapid focus/online events as well
    // as concurrent events. Manual retry remains immediately available.
    if (Date.now() - lastStartedAt < 5_000) return;
    lastStartedAt = Date.now();
    void queryClient.invalidateQueries({ queryKey: authQueryOptions.queryKey }, { cancelRefetch: false });
  };
  const resourceFailure = () => revalidate();
  const online = () => revalidate(true);
  const visible = () => {
    if (browser.document.visibilityState === "visible" && browser.isOnline()) revalidate(true);
  };
  browser.window.addEventListener("nbs:auth-revalidate", resourceFailure);
  browser.window.addEventListener("online", online);
  browser.document.addEventListener("visibilitychange", visible);
  return () => {
    browser.window.removeEventListener("nbs:auth-revalidate", resourceFailure);
    browser.window.removeEventListener("online", online);
    browser.document.removeEventListener("visibilitychange", visible);
  };
}

export async function clearCachedSession(queryClient: QueryClient, redirect: () => void) {
  await queryClient.cancelQueries();
  queryClient.clear();
  queryClient.setQueryData(authQueryOptions.queryKey, null);
  redirect();
}

export function logoutMutationOptions(queryClient: QueryClient, redirect: () => void) {
  return {
    mutationFn: () => api.post<{ ok: boolean }>("/auth/logout"),
    onSettled: () => clearCachedSession(queryClient, redirect),
  };
}
