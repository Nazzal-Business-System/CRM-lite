import type { QueryClient } from "@tanstack/react-query";
import type { AuthUser } from "@nbs/shared";
import { api, isConfirmedUnauthenticated } from "./api";

export const authQueryOptions = {
  queryKey: ["auth", "me"] as const,
  queryFn: async (): Promise<AuthUser | null> => {
    try {
      return (await api.get<{ user: AuthUser }>("/auth/me")).user;
    } catch (error) {
      if (isConfirmedUnauthenticated(error)) return null;
      // Throwing preserves previously verified identity in React Query.
      throw error;
    }
  },
  retry: false,
  staleTime: 60_000,
};

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
