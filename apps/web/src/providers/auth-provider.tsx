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
import { api, ApiError, isServiceUnavailable } from "@/lib/api";
import { navigateTo } from "@/lib/navigate";
import { defaultAuthenticatedPath } from "@/lib/navigation";

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();

  const meQuery = useQuery({
    queryKey: ["auth", "me"],
    queryFn: async () => {
      try {
        const data = await api.get<{ user: AuthUser }>("/auth/me");
        return data.user;
      } catch (error) {
        if (
          (error instanceof ApiError && error.status === 401) ||
          isServiceUnavailable(error)
        ) {
          return null;
        }
        throw error;
      }
    },
    retry: false,
    staleTime: 60_000,
  });

  const loginMutation = useMutation({
    mutationFn: (input: { email: string; password: string }) =>
      api.post<{ user: AuthUser }>("/auth/login", input),
    onSuccess: async (data) => {
      queryClient.setQueryData(["auth", "me"], data.user);
      await queryClient.invalidateQueries({ queryKey: ["users"] });
      await queryClient.invalidateQueries({ queryKey: ["roles"] });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: () => api.post<{ ok: boolean }>("/auth/logout"),
    onSettled: async () => {
      queryClient.setQueryData(["auth", "me"], null);
      queryClient.clear();
      router.replace("/login");
    },
  });

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
    await logoutMutation.mutateAsync();
  }, [logoutMutation]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: meQuery.data ?? null,
      isLoading: meQuery.isLoading,
      isAuthenticated: Boolean(meQuery.data),
      login,
      logout,
    }),
    [login, logout, meQuery.data, meQuery.isLoading],
  );

  useEffect(() => {
    const onUnauthorized = () => {
      queryClient.setQueryData(["auth", "me"], null);
      if (pathname !== "/login") {
        router.replace("/login");
      }
    };

    window.addEventListener("nbs:unauthorized", onUnauthorized);
    return () => window.removeEventListener("nbs:unauthorized", onUnauthorized);
  }, [pathname, queryClient, router]);

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

    if (!user) {
      navigateTo(router, "/login", pathname, true);
    }
  }, [meQuery.data, meQuery.isLoading, pathname, router]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider.");
  }
  return context;
}
