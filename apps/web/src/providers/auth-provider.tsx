"use client";

import type { AuthUser } from "@nbs/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import { api } from "@/lib/api";
import { authQueryOptions, logoutMutationOptions, clearCachedSession, subscribeAuthRevalidation } from "@/lib/auth-query";
import { useI18n } from "@/i18n/provider";
import { navigateTo } from "@/lib/navigate";
import { defaultAuthenticatedPath } from "@/lib/navigation";
import { AuthConnectionState } from "@/components/auth-connection-state";

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  endSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();

  const meQuery = useQuery(authQueryOptions);
  const { t } = useI18n();

  const loginMutation = useMutation({
    mutationFn: (input: { email: string; password: string }) =>
      api.post<{ user: AuthUser }>("/auth/login", input),
    onSuccess: async (data) => {
      queryClient.setQueryData(["auth", "me"], data.user);
      await queryClient.invalidateQueries({ queryKey: ["users"] });
      await queryClient.invalidateQueries({ queryKey: ["roles"] });
    },
  });

  const logoutMutation = useMutation(logoutMutationOptions(queryClient, () => router.replace("/login")));

  const login = useCallback(
    async (email: string, password: string) => {
      const result = await loginMutation.mutateAsync({ email, password });
      const destination = defaultAuthenticatedPath(result.user.permissions);
      navigateTo(router, destination, pathname, true);
      return result.user;
    },
    [loginMutation, pathname, router],
  );

  const logout = useCallback(async () => {
    try {
      await logoutMutation.mutateAsync();
    } catch {
      // onSettled always removes cached identity and returns to login. The API
      // normally clears the cookie even if its audit write is unavailable.
    }
  }, [logoutMutation]);

  const endSession = useCallback(() => clearCachedSession(queryClient, () => router.replace("/login")), [queryClient, router]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: meQuery.data ?? null,
      isLoading: meQuery.isLoading,
      isAuthenticated: Boolean(meQuery.data),
      login,
      logout,
      endSession,
    }),
    [login, logout, endSession, meQuery.data, meQuery.isLoading],
  );

  useEffect(() => subscribeAuthRevalidation(queryClient, {
    window, document, isOnline: () => navigator.onLine,
  }), [queryClient]);

  useEffect(() => {
    if (meQuery.isLoading) {
      return;
    }

    const user = meQuery.data ?? null;

    if (pathname === "/login") {
      if (user) {
        navigateTo(
          router,
          defaultAuthenticatedPath(user.permissions),
          pathname,
          true,
        );
      }
      return;
    }

    if (meQuery.data === null) {
      navigateTo(router, "/login", pathname, true);
    }
  }, [meQuery.data, meQuery.isLoading, pathname, router]);

  return (
    <AuthContext.Provider value={value}>
      {meQuery.isError && meQuery.data && (
        <div role="alert" className="fixed inset-x-0 top-0 z-[100] flex items-center justify-center gap-3 border-b bg-background p-4 text-sm shadow-md">
          <span>{t(meQuery.isFetching ? "auth.connecting" : "auth.connectionError")}</span>
          <button type="button" className="underline" disabled={meQuery.isFetching} onClick={() => {
            void meQuery.refetch({ cancelRefetch: false });
          }}>{t("common.retry")}</button>
        </div>
      )}
      {meQuery.data === undefined
        ? <AuthConnectionState failed={meQuery.isError && !meQuery.isFetching} retry={() => { void meQuery.refetch({ cancelRefetch: false }); }} />
        : children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider.");
  }
  return context;
}
