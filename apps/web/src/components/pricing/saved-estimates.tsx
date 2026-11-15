"use client";
import { useState } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Pencil, Trash2, History } from "lucide-react";
import { PERMISSION_KEYS as P, pricingSelectionSchema } from "@nbs/shared";
import { useAuth } from "@/providers/auth-provider";
import { useI18n } from "@/i18n/provider";
import { AppLink } from "@/components/layout/app-link";
import { PaginationBar, Surface } from "@/components/crm/primitives";
import { EnumSelect } from "@/components/crm/selects";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDateTime } from "@/lib/format";
import { useDebouncedValue } from "@/lib/query";
import { canArchivePricing, pricingArchiveOptions, canSavePricing, savedDisplaySnapshot, pricingActorKey, savedEstimateOptions, savedEstimatesOptions } from "@/lib/pricing";
import { JodAmount, PriceBreakdown, PricingError, PricingLayout, PricingLoading, usePricingLabels } from "./pricing-shared";

export function SavedEstimates() {
  const { user } = useAuth();
  return <SavedEstimateList key={JSON.stringify(pricingActorKey(user))} />;
}
function SavedEstimateList() {
  const { user } = useAuth(); const { t, locale, dir } = useI18n();
  const [page, setPage] = useState(1); const [search, setSearch] = useState(""); const [scope, setScope] = useState<"all" | "standalone" | "linked">("all"); const debounced = useDebouncedValue(search);
  const client=useQueryClient();const [archiveTarget,setArchiveTarget]=useState<Parameters<ReturnType<typeof pricingArchiveOptions>["mutationFn"]>[0]|null>(null);
  const archive=useMutation(pricingArchiveOptions(client,user));
  const query = useQuery(savedEstimatesOptions(user, { page, search: debounced, scope }));
  return <PricingLayout>
    <p className="text-sm text-muted-foreground">{t(user?.permissions.includes(P.PRICING_ESTIMATES_VIEW_ALL) ? "pricing.visibilityAll" : "pricing.visibilityOwn")}</p>
    <div className="flex flex-col gap-3 sm:flex-row"><Input className="sm:max-w-md" aria-label={t("pricing.search")} placeholder={t("pricing.search")} maxLength={200} value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} /><label htmlFor="pricing-scope-filter" className="sr-only">{t("pricing.scope")}</label><EnumSelect dir={dir} id="pricing-scope-filter" value={scope} onChange={value => { if (["all", "standalone", "linked"].includes(value)) { setScope(value as typeof scope); setPage(1); } }} options={(["all", "standalone", "linked"] as const).map(value => ({ value, label: t(`pricing.${value}`) }))} /><Button variant="outline" disabled={query.isFetching} onClick={() => { void query.refetch(); }}>{t("pricing.refresh")}</Button></div>
    {query.isError ? <PricingError context="service" error={query.error} retry={() => { void query.refetch(); }} /> : query.isFetching || !query.data ? <PricingLoading /> : !query.data.items.length ? <div role="status" className="space-y-3 py-12 text-center text-muted-foreground"><History className="mx-auto size-7" aria-hidden="true" /><p className="text-sm font-medium">{t("pricing.empty")}</p><p className="text-xs">{t("pricing.emptyHint")}</p></div> : <>
      <Surface className="min-w-0 divide-y divide-border/60 overflow-hidden">{query.data.items.map(item => <article key={item.id} className="grid min-w-0 items-center gap-4 p-4 sm:grid-cols-[minmax(0,1fr)_12rem_auto] sm:p-5">
        <div className="min-w-0 space-y-2"><h2 className="break-words text-sm font-semibold"><AppLink className="inline-flex max-w-full items-center gap-2 rounded-sm transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-ring" href={`/pricing/estimates/${encodeURIComponent(item.id)}`}><span className="min-w-0 break-words">{item.title}</span><ArrowUpRight className="size-3.5 shrink-0 rtl:-scale-x-100" aria-hidden="true" /></AppLink></h2>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground"><span>{t(item.companyId ? "pricing.linked" : "pricing.standalone")}</span><span>{t(item.createdById === user?.id ? "pricing.you" : "pricing.otherCreator")}</span><bdi>{formatDateTime(item.createdAt, locale)}</bdi></div>
          <p className="break-all text-xs text-muted-foreground">{t("pricing.catalogVersion")}: <bdi>{item.catalogVersion}</bdi></p>
        </div><SavedTotal result={item.result} />
        <div className="flex flex-wrap gap-2">{canSavePricing(user) && <Button asChild variant="outline" size="sm"><AppLink href={`/pricing?copy=${encodeURIComponent(item.id)}`}><Pencil className="size-3.5" aria-hidden="true" />{t("pricing.editEstimate")}</AppLink></Button>}{canArchivePricing(user,item) && <Button variant="ghost" size="sm" onClick={()=>{archive.reset();setArchiveTarget(item);}}><Trash2 className="size-3.5" aria-hidden="true" />{t("common.delete")}</Button>}</div>
      </article>)}</Surface><PaginationBar page={page} pageSize={query.data.pageSize} total={query.data.total} onPageChange={setPage} />
    </>}
    {archive.isSuccess&&<p role="status" className="text-sm text-muted-foreground">{t("pricing.archivedSuccess")}</p>}
    <Dialog open={!!archiveTarget} onOpenChange={open=>{if(!open&&!archive.isPending)setArchiveTarget(null);}}><DialogContent dir={dir} closeLabel={t("common.close")} onEscapeKeyDown={event=>{if(archive.isPending)event.preventDefault();}} onPointerDownOutside={event=>{if(archive.isPending)event.preventDefault();}}>
      <DialogTitle>{t("pricing.deleteEstimate")}</DialogTitle><DialogDescription>{t("pricing.archiveHint")}</DialogDescription><p className="break-words text-sm font-medium">{archiveTarget?.title}</p>
      {archive.isError&&<PricingError error={archive.error} retry={()=>{if(archiveTarget)archive.mutate(archiveTarget,{onSuccess:()=>{setArchiveTarget(null);setPage(1);}});}}/>}
      <div className="flex justify-end gap-3"><Button variant="ghost" disabled={archive.isPending} onClick={()=>setArchiveTarget(null)}>{t("common.cancel")}</Button><Button variant="destructive" disabled={archive.isPending} onClick={()=>{if(archiveTarget)archive.mutate(archiveTarget,{onSuccess:()=>{setArchiveTarget(null);setPage(1);}});}}>{t(archive.isPending?"pricing.deleting":"common.delete")}</Button></div>
    </DialogContent></Dialog>
  </PricingLayout>;
}
function SavedTotal({ result }: { result: unknown }) {
  const { t } = useI18n(); const snapshot = savedDisplaySnapshot(result);
  return snapshot ? <p className="flex flex-wrap justify-between gap-2 text-sm"><span>{t(snapshot.hasStartingFromItems ? "pricing.minimum" : "pricing.total")}</span><JodAmount value={snapshot.estimatedTotal} currency={snapshot.currency} /></p> : <p className="text-xs text-muted-foreground">{t("pricing.unsupportedSnapshot")}</p>;
}
export function SavedEstimateDetail({ id }: { id: string }) {
  const { user } = useAuth(); const { t, locale } = useI18n(); const label = usePricingLabels(); const query = useQuery(savedEstimateOptions(user, id));
  if (query.isError) return <PricingLayout><PricingError error={query.error} retry={() => { void query.refetch(); }} /></PricingLayout>;
  if (!query.data || query.isFetching) return <PricingLayout><PricingLoading /></PricingLayout>;
  const item = query.data; const snapshot = savedDisplaySnapshot(item.result); const selection = pricingSelectionSchema.safeParse(item.selection && typeof item.selection === "object" ? Object.fromEntries(Object.entries(item.selection).filter(([key])=>key!=="catalogVersion")) : item.selection);
  return <PricingLayout><Surface className="min-w-0 space-y-4 p-4 sm:p-6">
    <h2 className="break-words text-xl font-semibold">{item.title}</h2><p className="text-sm text-muted-foreground">{t("pricing.snapshot")}</p>
    <dl className="grid min-w-0 gap-3 text-sm sm:grid-cols-2"><div><dt className="text-muted-foreground">{t("pricing.created")}</dt><dd><bdi>{formatDateTime(item.createdAt, locale)}</bdi></dd></div><div><dt className="text-muted-foreground">{t("pricing.scope")}</dt><dd>{t(item.companyId ? "pricing.linked" : "pricing.standalone")}</dd></div><div><dt className="text-muted-foreground">{t("pricing.catalogVersion")}</dt><dd className="break-all"><bdi>{item.catalogVersion}</bdi></dd></div><div><dt className="text-muted-foreground">{t("pricing.calculationVersion")}</dt><dd className="break-all"><bdi>{item.calculationVersion}</bdi></dd></div></dl>
    {selection.success && <div className="space-y-2 text-sm"><h3 className="font-medium">{label(selection.data.product, "product")}</h3><p className="break-words">{[...selection.data.modules.map(id => label(id)), ...selection.data.addons.map(id => label(id, "addon")), ...selection.data.customModuleTier.map(id => label(id, "custom-module")), ...(selection.data.customSoftwareTier ? [label(selection.data.customSoftwareTier, "custom-software")] : [])].join(" · ")}</p>{selection.data.customNotes && <div><h4 className="font-medium">{t("pricing.scopeNotes")}</h4><p className="whitespace-pre-wrap break-words">{selection.data.customNotes}</p></div>}</div>}
    {item.notes && <div><h3 className="text-sm font-medium">{t("pricing.notes")}</h3><p className="whitespace-pre-wrap break-words text-sm">{item.notes}</p></div>}
    <div className="flex flex-wrap gap-3">{item.companyId && user?.permissions.includes(P.COMPANIES_VIEW) && <Button asChild variant="outline"><AppLink href={`/companies/${encodeURIComponent(item.companyId)}`}>{t("pricing.viewCompany")}</AppLink></Button>}{canSavePricing(user) && <Button asChild variant="outline"><AppLink href={`/pricing?copy=${encodeURIComponent(item.id)}`}><Pencil className="size-4" aria-hidden="true" />{t("pricing.editEstimate")}</AppLink></Button>}</div>
  </Surface>{snapshot ? <PriceBreakdown estimate={snapshot} /> : <p role="alert">{t("pricing.unsupportedSnapshot")}</p>}</PricingLayout>;
}
