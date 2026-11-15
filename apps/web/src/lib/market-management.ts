import { INITIAL_SALES_MARKETS, PERMISSION_KEYS, SYSTEM_ROLE_NAMES, replaceMarketMembershipsSchema, type AuthUser, type SalesMarketRef, type UserMarketMembership } from "@nbs/shared";
import type { QueryClient } from "@tanstack/react-query";
import { api, apiRequest, ApiError } from "./api";
import { toQuery } from "./query";
import { sortParams, type SortSelection } from "./sorting";

export function isSystemMarketAdmin(user: AuthUser | null | undefined): boolean {
  return Boolean(user?.role.isSystem && user.role.name === SYSTEM_ROLE_NAMES.ADMIN);
}
export function canManageUserMarkets(user: AuthUser | null | undefined): boolean {
  return isSystemMarketAdmin(user) && Boolean(user?.permissions.includes(PERMISSION_KEYS.MARKETS_MANAGE_MEMBERSHIPS));
}
export function countryName(code: string | null | undefined, locale: string, empty: string): string {
  if (!code) return empty;
  try { return new Intl.DisplayNames([locale], { type: "region" }).of(code) ?? code; }
  catch { return code; }
}
export function marketName(code: string | null | undefined, markets: readonly SalesMarketRef[], locale: string, empty: string): string {
  if (!code) return empty;
  const market = markets.find((item) => item.code === code) ?? INITIAL_SALES_MARKETS.find((item) => item.code === code);
  return market ? (locale === "ar" ? market.nameAr || market.name : market.name) || code : code;
}
export function marketCatalogOptions(viewerId: string | undefined, management = false) {
  return { queryKey: [management ? "managed-sales-markets" : "sales-markets", viewerId],
    queryFn: () => api.get<{ markets: SalesMarketRef[] }>(management ? "/admin/sales-markets" : "/companies/sales-markets"),
    staleTime: 60_000,
  };
}
export function userMarketsOptions(viewerId: string | undefined, userId: string) {
  return { queryKey: ["user-markets", viewerId, userId],
    queryFn: () => api.get<{ memberships: UserMarketMembership[] }>(`/admin/users/${encodeURIComponent(userId)}/markets`),
  };
}
export function marketMembershipMutationOptions(client: QueryClient, viewer: AuthUser | null, userId: string) {
  return {
    mutationFn: async (marketCodes: string[]) => {
      if (!canManageUserMarkets(viewer)) throw new ApiError(403, "FORBIDDEN", "Market management is restricted.");
      const body = replaceMarketMembershipsSchema.parse({ marketCodes });
      return apiRequest<{ userId: string; marketCodes: string[] }>(`/admin/users/${encodeURIComponent(userId)}/markets`, { method: "PUT", body: JSON.stringify(body) });
    },
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: userMarketsOptions(viewer?.id, userId).queryKey }),
        client.invalidateQueries({ queryKey: ["audit-logs"] }),
      ]);
    },
  };
}
export function sameMarketSelection(left: readonly string[], right: readonly string[]): boolean {
  const selected = new Set(left);
  const stored = new Set(right);
  return selected.size === stored.size && [...selected].every((code) => stored.has(code));
}
export function marketErrorKey(error: unknown): string {
  if (error instanceof ApiError && error.status === 403) return "markets.denied";
  if (error instanceof ApiError && error.status === 503) return "markets.unavailable";
  return "markets.loadFailed";
}
export interface CompanyMarketFilters {
  search: string; priority: string; sort: SortSelection; page: number;
  ownerId: string | null; countryCode: string; salesMarketCode: string;
}
export function companyMarketListRequest(filters: CompanyMarketFilters, viewerId?: string) {
  return { queryKey: ["companies", viewerId, filters],
    path: `/companies${toQuery({ search: filters.search, priority: filters.priority, ownerId: filters.ownerId,
      countryCode: filters.countryCode, salesMarketCode: filters.salesMarketCode, page: filters.page, pageSize: 20, ...sortParams(filters.sort) })}`,
  };
}
