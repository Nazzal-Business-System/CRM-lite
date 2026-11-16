import { marketDisplayCurrency, createUserSchema, updateUserSchema, type AuthUser, type SalesMarketRef, type PriceBookId } from "@nbs/shared";
import { api, ApiError } from "./api";
import type { QueryClient } from "@tanstack/react-query";
import { canManageUserMarkets } from "./market-management";
import { canManagePartnerPriceBooks } from "./partner-price-books";
export interface PartnerForm { name: string; email: string; password: string; roleId: string; accountType: "PARTNER" | "INTERNAL"; marketCodes: string[]; defaultMarketCode: string | null; priceBookAccess?: { scope: "selected"; bookIds: PriceBookId[]; defaultBookId: PriceBookId | null } }
export interface AccountRole { id: string; name: string; isSystem: boolean; permissionKeys?: string[] }
export type PartnerEditorTarget = { mode: "create"; internal: boolean } | { mode: "edit"; id: string };
export function partnerFormDirty(form: PartnerForm, initial: PartnerForm) {
  const values = (value: PartnerForm) => [value.name, value.email, value.password, value.roleId, value.accountType, [...value.marketCodes].sort(), value.defaultMarketCode, value.priceBookAccess ? [[...value.priceBookAccess.bookIds].sort(), value.priceBookAccess.defaultBookId] : null];
  return JSON.stringify(values(form)) !== JSON.stringify(values(initial));
}
export function partnerDismissal({ dirty, busy }: { dirty: boolean; busy: boolean }) {
  return busy ? "blocked" : dirty ? "confirm" : "close";
}
export function partnerSaveOptions(client: QueryClient, options: { viewer: AuthUser | null; targetId?: string; initial?: PartnerForm; global: boolean; onSaved: () => void; notify: (key: string) => void }) {
  return {
    mutationFn: (form: PartnerForm) => {
      const bookState = (value: PartnerForm) => value.priceBookAccess ? JSON.stringify([[...value.priceBookAccess.bookIds].sort(), value.priceBookAccess.defaultBookId]) : "";
      // Basic account edits must not overwrite grants changed by another Admin
      // after this modal loaded. Only submit pricing when explicitly edited.
      const unchangedBooks = options.targetId && options.initial && bookState(form) === bookState(options.initial);
      const payload = partnerPayload(unchangedBooks ? { ...form, priceBookAccess: undefined } : form, options.viewer, !!options.targetId, options.global);
      return options.targetId ? api.patch(`/users/${encodeURIComponent(options.targetId)}`, payload) : api.post("/users", payload);
    },
    onSuccess: async (_result: unknown, form: PartnerForm) => {
      options.notify(options.targetId ? "partners.updated" : form.accountType === "PARTNER" ? "partners.partnerCreated" : "partners.internalCreated");
      await Promise.all([client.invalidateQueries({ queryKey: ["users"] }), client.invalidateQueries({ queryKey: ["auth", "me"] }), client.invalidateQueries({ queryKey: ["user-sales-markets"] }), client.invalidateQueries({ queryKey: ["user-price-books"] }), client.invalidateQueries({ queryKey: ["pricing"] })]);
      options.onSaved();
    },
  };
}
export const partnerActorKey = (user: AuthUser | null) => [user?.id, [...(user?.permissions ?? [])].sort().join(",")];
export function partnerSetupError(value: PartnerForm, global: boolean) {
  if (!global && value.defaultMarketCode && !value.marketCodes.includes(value.defaultMarketCode)) return "partners.defaultRequired";
  if (!global && value.accountType === "PARTNER" && (!value.marketCodes.length || !value.defaultMarketCode)) return "partners.marketsRequired";
  return null;
}
export function partnerPayload(form: PartnerForm, viewer: AuthUser | null, editing: boolean, global: boolean) {
  if (form.priceBookAccess !== undefined && !canManagePartnerPriceBooks(viewer)) throw new ApiError(403, "FORBIDDEN", "Price-book management permission required.");
  const marketEditor = canManageUserMarkets(viewer);
  if (!marketEditor && form.accountType === "PARTNER" && !editing) throw new ApiError(403, "FORBIDDEN", "Partner onboarding requires market management access.");
  if (marketEditor && partnerSetupError(form, global)) throw new ApiError(400, "VALIDATION_ERROR", "Assign markets and a valid default.");
  const payload = { name: form.name, email: form.email, roleId: form.roleId, ...(!editing || form.password ? { password: form.password } : {}),
    ...(marketEditor ? { accountType: form.accountType, marketCodes: form.marketCodes, defaultMarketCode: form.defaultMarketCode } : {}),
    ...(form.priceBookAccess !== undefined ? { priceBookAccess: form.priceBookAccess } : {}) };
  return editing ? updateUserSchema.parse(payload) : createUserSchema.parse(payload);
}
export const partnerDetailOptions = (viewer: AuthUser | null, id: string) => ({ queryKey: ["users", "detail", ...partnerActorKey(viewer), id], enabled: !!id && !!viewer?.permissions.includes("users.view"), retry: false,
  queryFn: () => api.get<{ user: AuthUser }>(`/users/${encodeURIComponent(id)}`),
});
export function partnerMarketLabel(code: string, markets: SalesMarketRef[], locale: string, international: string) {
  if (code === "OTHER") return international;
  const market = markets.find(item => item.code === code); return market ? locale === "ar" ? market.nameAr : market.name : code;
}
export { marketDisplayCurrency };
