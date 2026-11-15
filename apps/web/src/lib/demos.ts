import { demoResponseSchema, PERMISSION_KEYS, type AuthUser } from "@nbs/shared";
import { api, ApiError } from "./api";
export const canViewDemos = (user: AuthUser | null) => !!user?.permissions.includes(PERMISSION_KEYS.DEMOS_VIEW);
export const demoQueryOptions = (user: AuthUser | null) => ({ queryKey: ["demos", "hub", user?.id, [...(user?.permissions ?? [])].sort().join(",")], enabled: canViewDemos(user), retry: false, refetchOnWindowFocus: true,
  queryFn: async () => { if (!canViewDemos(user)) throw new ApiError(403, "FORBIDDEN", "Demo permission is required."); return demoResponseSchema.parse(await api.get("/demos")); },
});
