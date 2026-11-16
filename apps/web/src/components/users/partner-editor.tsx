"use client";
import { toast } from "sonner";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type AuthUser } from "@nbs/shared";
import { useAuth } from "@/providers/auth-provider";
import { useI18n } from "@/i18n/provider";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { EnumSelect } from "@/components/crm/selects";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";
import { canManageUserMarkets, marketCatalogOptions } from "@/lib/market-management";
import { partnerActorKey, partnerDetailOptions, partnerPayload, partnerSetupError, partnerFormDirty, partnerDismissal, partnerSaveOptions, type PartnerEditorTarget, type AccountRole, type PartnerForm } from "@/lib/partners";
import { PartnerMarketFields } from "./partner-market-fields";
import { canManagePartnerPriceBooks, partnerPriceBookOptions } from "@/lib/partner-price-books";
import { PartnerPriceBookFields } from "./partner-price-book-fields";

export function PartnerEditor({ editor, onClose, returnFocus }: { editor: PartnerEditorTarget; onClose: () => void; returnFocus: () => void }) {
  const { user } = useAuth(); const { t, dir } = useI18n();
  const id = editor.mode === "edit" ? editor.id : "";
  const allowed = !!user?.permissions.includes(id ? "users.update" : "users.create") && (!id || user.permissions.includes("users.view")) && (editor.mode !== "create" || editor.internal || canManageUserMarkets(user));
  const detail = useQuery({ ...partnerDetailOptions(user, id), enabled: allowed && !!id });
  const canBooks = canManagePartnerPriceBooks(user);
  const bookAccess = useQuery({ ...partnerPriceBookOptions(user, id), enabled: allowed && !!id && canBooks });
  const guard = useRef({ dirty: false, busy: false }); const [confirm, setConfirm] = useState(false);
  const updateGuard = useCallback((dirty: boolean, busy: boolean) => { guard.current = { dirty, busy }; }, []);
  const dismiss = () => { const decision = partnerDismissal(guard.current); if (decision === "confirm") setConfirm(true); else if (decision === "close") onClose(); };
  useEffect(() => { const beforeUnload = (event: BeforeUnloadEvent) => { if (guard.current.dirty || guard.current.busy) { event.preventDefault(); event.returnValue = ""; } }; window.addEventListener("beforeunload", beforeUnload); return () => window.removeEventListener("beforeunload", beforeUnload); }, []);
  const unavailable = !!id && (!detail.data || canBooks && !bookAccess.data);
  const loadError = detail.error ?? bookAccess.error;
  const title = t(id ? "partners.edit" : editor.mode === "create" && editor.internal ? "partners.createInternal" : "partners.onboard");
  return <Dialog open onOpenChange={open => { if (!open) dismiss(); }}>
    <DialogContent dir={dir} closeLabel={t("partners.close")} className="flex h-[100dvh] max-h-[100dvh] w-full max-w-none flex-col gap-0 overflow-hidden rounded-none p-0 sm:h-[min(52rem,calc(100dvh-3rem))] sm:max-h-[calc(100dvh-3rem)] sm:w-[calc(100%-3rem)] sm:max-w-[56rem] sm:rounded-xl sm:p-0" onCloseAutoFocus={event => { event.preventDefault(); returnFocus(); }} onInteractOutside={event => { event.preventDefault(); if (!confirm) dismiss(); }}>
      <DialogHeader className="shrink-0 border-b border-border/60 px-5 py-5 pe-12 text-start sm:px-7 sm:pe-14"><DialogTitle>{title}</DialogTitle><DialogDescription>{t(id ? "partners.editDescription" : "partners.formDescription")}</DialogDescription></DialogHeader>
      {!allowed || unavailable ? <><div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-7"><p role={!allowed || loadError ? "alert" : "status"}>{t(!allowed || loadError instanceof ApiError && loadError.status === 403 ? "partners.denied" : loadError ? "partners.unavailable" : "common.loading")}</p>{allowed && loadError && <Button type="button" variant="outline" onClick={() => { void detail.refetch(); if (canBooks) void bookAccess.refetch(); }}>{t("common.retry")}</Button>}</div><div className="shrink-0 border-t border-border/60 px-7 py-4"><Button type="button" variant="outline" onClick={dismiss}>{t("common.cancel")}</Button></div></> : <PartnerFormView target={detail.data?.user} initialBookAccess={bookAccess.data} internal={editor.mode === "create" && editor.internal} onGuardChange={updateGuard} onCancel={dismiss} onSaved={onClose} />}
      <AlertDialog open={confirm} onOpenChange={setConfirm}><AlertDialogContent dir={dir}><AlertDialogTitle>{t("partners.discardTitle")}</AlertDialogTitle><AlertDialogDescription>{t("partners.discardDescription")}</AlertDialogDescription><AlertDialogFooter><AlertDialogCancel>{t("partners.keepEditing")}</AlertDialogCancel><AlertDialogAction onClick={() => { setConfirm(false); onClose(); }}>{t("partners.discard")}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </DialogContent>
  </Dialog>;
}
export function PartnerFormView({ target, internal, initialBookAccess, onGuardChange, onCancel, onSaved }: { target?: AuthUser; initialBookAccess?: PartnerForm["priceBookAccess"]; internal: boolean; onGuardChange: (dirty: boolean, busy: boolean) => void; onCancel: () => void; onSaved: () => void }) {
  const { user: viewer } = useAuth(); const { t, dir } = useI18n(); const client = useQueryClient(); const canMarkets = canManageUserMarkets(viewer);
  const canBooks = canManagePartnerPriceBooks(viewer);
  const [form, setForm] = useState<PartnerForm>(() => ({ name: target?.name ?? "", email: target?.email ?? "", password: "", roleId: target?.role.id ?? "", accountType: target?.accountType ?? (internal || !canMarkets ? "INTERNAL" : "PARTNER"), marketCodes: target?.marketCodes ?? [], defaultMarketCode: target?.defaultMarketCode ?? null, ...(canBooks ? { priceBookAccess: initialBookAccess ?? { scope: "selected", bookIds: [], defaultBookId: null } } : {}) }));
  const [initial] = useState(() => form);
  const [error, setError] = useState("");
  const roles = useQuery({ queryKey: ["role-options", ...partnerActorKey(viewer)], queryFn: () => api.get<{ roles: AccountRole[] }>("/roles/options"), retry: false });
  const catalog = useQuery({ ...marketCatalogOptions(viewer?.id, true), enabled: canMarkets, retry: false });
  const selectedRole = roles.data?.roles.find(role => role.id === form.roleId); const global = !!selectedRole?.isSystem && selectedRole.name === "Admin";
  const setupError = form.priceBookAccess?.bookIds.length && !form.priceBookAccess.defaultBookId ? "partners.priceBookDefaultRequired" : canMarkets ? partnerSetupError(form, global) : null;
  const pricingEnabled = (selectedRole?.permissionKeys ?? (selectedRole?.id === target?.role.id ? target?.permissions : []) ?? []).some(key => key === "pricing.view" || key.startsWith("pricing.estimates."));
  const mutation = useMutation(partnerSaveOptions(client, { viewer, targetId: target?.id, initial, global, onSaved, notify: key => toast.success(t(key)) }));
  const busy = mutation.isPending; const dirty = partnerFormDirty(form, initial);
  useLayoutEffect(() => { onGuardChange(dirty, busy); }, [dirty, busy, onGuardChange]);
  const change = (patch: Partial<PartnerForm>) => { setForm(value => ({ ...value, ...patch })); setError(""); mutation.reset(); };
  return <form className="flex min-h-0 flex-1 flex-col overflow-hidden" aria-busy={busy} onSubmit={event => { event.preventDefault(); if (busy) return; setError(""); try { partnerPayload(form, viewer, !!target, global); mutation.mutate(form); } catch { setError(t(setupError ?? "partners.validation")); } }}>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-6 sm:px-7">
      <fieldset disabled={busy} className="min-w-0 space-y-7">
        <section className="space-y-5"><div><h2 className="font-semibold">{t("partners.accountInfo")}</h2><p className="mt-1 text-sm text-muted-foreground">{t("partners.accountHint")}</p></div><div className="grid gap-5 sm:grid-cols-2"><div className="space-y-2"><label htmlFor="partner-name" className="text-sm font-medium">{t("users.name")}</label><Input id="partner-name" required maxLength={120} autoComplete="name" value={form.name} onChange={event => change({ name: event.target.value })} /></div><div className="space-y-2"><label htmlFor="partner-email" className="text-sm font-medium">{t("users.email")}</label><Input id="partner-email" required type="email" dir="ltr" autoComplete="email" value={form.email} onChange={event => change({ email: event.target.value })} /></div></div><div className="max-w-xl space-y-2"><label htmlFor="partner-password" className="text-sm font-medium">{t(target ? "users.newPasswordOptional" : "users.password")}</label><Input id="partner-password" type="password" autoComplete="new-password" required={!target} minLength={form.password || !target ? 10 : undefined} value={form.password} onChange={event => change({ password: event.target.value })} /><p className="text-xs leading-relaxed text-muted-foreground">{t(target ? "partners.passwordEditHint" : "partners.passwordHint")}</p></div></section>
        <section className="space-y-5 border-t border-border/60 pt-6"><div><h2 className="font-semibold">{t("partners.access")}</h2><p className="mt-1 text-sm text-muted-foreground">{t("partners.roleHint")}</p></div><div className="grid gap-5 sm:grid-cols-2"><div className="space-y-2"><label htmlFor="partner-kind" className="text-sm font-medium">{t("partners.accountType")}</label><EnumSelect id="partner-kind" dir={dir} disabled={busy || !canMarkets} value={form.accountType} onChange={value => { if (value === "PARTNER" || value === "INTERNAL") change({ accountType: value }); }} options={[{ value: "PARTNER", label: t("partners.partner") }, { value: "INTERNAL", label: t("partners.internal") }]} /></div><div className="space-y-2"><label htmlFor="partner-role" className="text-sm font-medium">{t("users.role")}</label><EnumSelect id="partner-role" placeholder={t("users.selectRole")} dir={dir} disabled={busy || roles.isPending || roles.isError} value={form.roleId} onChange={roleId => change({ roleId })} options={(roles.data?.roles ?? []).map(role => ({ value: role.id, label: role.name }))} />{roles.isError && <Button type="button" variant="outline" onClick={() => { void roles.refetch(); }}>{t("common.retry")}</Button>}</div></div></section>
        <section className="space-y-5 border-t border-border/60 pt-7"><h2 className="font-semibold">{t("partners.markets")}</h2>{!canMarkets ? <p className="text-sm text-muted-foreground">{t("partners.marketDenied")}</p> : catalog.isPending ? <p role="status" className="text-sm text-muted-foreground">{t("common.loading")}</p> : catalog.isError ? <div role="alert" className="space-y-3"><p>{t("partners.unavailable")}</p><Button type="button" variant="outline" onClick={() => { void catalog.refetch(); }}>{t("common.retry")}</Button></div> : <PartnerMarketFields markets={catalog.data.markets} selected={form.marketCodes} defaultMarketCode={form.defaultMarketCode} global={global} disabled={busy} onChange={(marketCodes, defaultMarketCode) => change({ marketCodes, defaultMarketCode })} />}{setupError && <p className="text-sm text-muted-foreground">{t(setupError)}</p>}</section>
        <section className="space-y-5 border-t border-border/60 pt-7"><h2 className="font-semibold">{t("partners.priceBooks")}</h2>
          {canBooks && form.priceBookAccess ? <PartnerPriceBookFields value={form.priceBookAccess} disabled={busy} pricingEnabled={pricingEnabled} onChange={priceBookAccess => change({ priceBookAccess })} /> : <p className="text-sm text-muted-foreground">{t("partners.priceBookDenied")}</p>}
        </section>
      </fieldset>

      </div>
      <div className="shrink-0 space-y-3 border-t border-border/60 px-5 py-4 sm:px-7">
      {(error || mutation.isError) && <p role="alert" className="text-sm text-destructive">{error || (mutation.error instanceof ApiError && mutation.error.status === 403 ? t("partners.denied") : mutation.error instanceof ApiError && mutation.error.status >= 500 ? t("partners.unavailable") : mutation.error instanceof ApiError && mutation.error.status === 409 ? t("partners.emailExists") : t("partners.validation"))}</p>}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><Button type="button" variant="outline" disabled={busy} onClick={onCancel}>{t("common.cancel")}</Button><Button type="submit" loading={busy} disabled={!form.roleId || !!setupError || roles.isError || canMarkets && (catalog.isPending || catalog.isError)}>{t(target ? "users.saveChanges" : "partners.create")}</Button></div>
      </div>
    </form>;
}
