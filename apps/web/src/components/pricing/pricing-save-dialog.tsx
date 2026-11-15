"use client";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { AuthUser, PricingRequest, PricingCurrency } from "@nbs/shared";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { AppLink } from "@/components/layout/app-link";
import { useI18n } from "@/i18n/provider";
import { savedDisplaySnapshot, canLinkPricing, pricingConfigurationKey, pricingSaveOptions, type SavedEstimate } from "@/lib/pricing";
import { nativeSelectionFromDraft,requestBookReference,type NativeBookReference } from "@/lib/price-book-pricing";
import { PricingCompanyPicker } from "./pricing-company-picker";
import { PricingError } from "./pricing-shared";

export function PricingSaveDialog({ open, onOpenChange, user, configuration, displayCurrency, priceBook, current, source, onBusyChange }: { open: boolean; onOpenChange: (open: boolean) => void; user: AuthUser | null; configuration: PricingRequest; displayCurrency: PricingCurrency; priceBook?:NativeBookReference; current: boolean; source?: SavedEstimate; onBusyChange: (busy: boolean) => void }) {
  const { t, dir } = useI18n(); const client = useQueryClient();
  const [title, setTitle] = useState(source ? t("pricing.copyTitle", { title: source.title }).slice(0, 200) : "");
  const [notes, setNotes] = useState(source?.notes ?? ""); const [linked, setLinked] = useState(!!source?.companyId); const [companyId, setCompanyId] = useState(source?.companyId ?? "");
  const save = useMutation(pricingSaveOptions(client, user, source?.id));
  const savedCurrent = save.isSuccess && savedDisplaySnapshot(save.data.result)?.currency === displayCurrency && pricingConfigurationKey({...save.data.selection as object,catalogVersion:configuration.catalogVersion}) === pricingConfigurationKey(configuration) && (!priceBook || savedDisplaySnapshot(save.data.result)?.priceBook?.id === priceBook.id && savedDisplaySnapshot(save.data.result)?.priceBook?.version === priceBook.version);
  return <Dialog open={open} onOpenChange={value => { if (!save.isPending) onOpenChange(value); }}><DialogContent dir={dir} closeLabel={t("common.close")} onEscapeKeyDown={event => { if (save.isPending) event.preventDefault(); }} onPointerDownOutside={event => { if (save.isPending) event.preventDefault(); }}>
    <div className="space-y-2 pe-6"><DialogTitle>{t("pricing.save")}</DialogTitle><DialogDescription>{t(priceBook?"pricing.nativeSaveHint":"pricing.saveHint")}</DialogDescription></div>
    <form className="space-y-5" onSubmit={event => { event.preventDefault(); if (!current || !title.trim() || save.isPending || savedCurrent || linked && (!companyId || !canLinkPricing(user))) return; onBusyChange(true); void save.mutateAsync(priceBook?{title,notes,companyId:linked?companyId:null,priceBook:requestBookReference(priceBook),configuration:nativeSelectionFromDraft(configuration)}:{ title, notes, companyId: linked ? companyId : null, displayCurrency, configuration }).catch(() => { /* Recoverable error rendered below. */ }).finally(() => onBusyChange(false)); }}>
      <div className="space-y-2"><label htmlFor="estimate-title" className="text-sm font-medium">{t("pricing.titleLabel")}</label><Input id="estimate-title" autoFocus required maxLength={200} value={title} disabled={save.isPending} onChange={event => { setTitle(event.target.value); save.reset(); }} /></div>
      <div className="space-y-2"><label htmlFor="estimate-notes" className="text-sm font-medium">{t("pricing.notes")}</label><Textarea id="estimate-notes" maxLength={4000} value={notes} disabled={save.isPending} onChange={event => { setNotes(event.target.value); save.reset(); }} /></div>
      {canLinkPricing(user) ? <><label className="flex items-center gap-3 text-sm"><Checkbox checked={linked} disabled={save.isPending} onCheckedChange={value => { setLinked(value === true); setCompanyId(""); save.reset(); }} />{t("pricing.linkCompany")}</label>{linked && <PricingCompanyPicker user={user} value={companyId} disabled={save.isPending} onChange={id => { setCompanyId(id); save.reset(); }} />}</> : <p className="text-sm text-muted-foreground">{t("pricing.noCompanyPermission")}</p>}
      {!current && <p role="status" className="text-sm text-muted-foreground">{t("pricing.updating")}</p>}
      {save.isError && <PricingError error={save.error} />}
      {savedCurrent && <p role="status" className="text-sm">{t("pricing.savedSuccess")} <AppLink className="underline underline-offset-4" href={`/pricing/estimates/${encodeURIComponent(save.data.id)}`}>{t("pricing.viewSaved")}</AppLink></p>}
      <div className="flex flex-wrap justify-end gap-3"><Button type="button" variant="ghost" disabled={save.isPending} onClick={() => onOpenChange(false)}>{t("common.close")}</Button><Button type="submit" disabled={!current || !title.trim() || save.isPending || savedCurrent || linked && (!companyId || !canLinkPricing(user))}>{t(save.isPending ? "pricing.saving" : source ? "pricing.saveRevision" : "pricing.save")}</Button></div>
    </form>
  </DialogContent></Dialog>;
}
