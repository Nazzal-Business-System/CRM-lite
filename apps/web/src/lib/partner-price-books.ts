import { z } from "zod";
import { PERMISSION_KEYS, priceBookIdSchema, type AuthUser } from "@nbs/shared";
import { api, ApiError } from "./api";

export const canManagePartnerPriceBooks = (user: AuthUser | null) => !!user?.role.isSystem && user.role.name === "Admin" && user.permissions.includes(PERMISSION_KEYS.PRICING_PRICEBOOKS_MANAGE);
const accessSchema = z.object({ grants: z.array(z.object({ bookId: priceBookIdSchema })), defaultBookId: priceBookIdSchema.nullable() });
export function partnerPriceBookOptions(user: AuthUser | null, id: string) {
  return {
    queryKey: ["user-price-books", user?.id, user?.role.name, user?.role.isSystem, [...(user?.permissions ?? [])].sort().join(","), id],
    enabled: !!id && canManagePartnerPriceBooks(user), retry: false,
    queryFn: async () => {
      if (!canManagePartnerPriceBooks(user)) throw new ApiError(403, "FORBIDDEN", "Price-book management permission required.");
      const data = accessSchema.parse(await api.get(`/users/${encodeURIComponent(id)}/price-books`));
      return { scope: "selected" as const, bookIds: data.grants.map(grant => grant.bookId), defaultBookId: data.defaultBookId };
    },
  };
}
