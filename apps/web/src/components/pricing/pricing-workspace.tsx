"use client";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Boxes, ShoppingCart, Layers3, Code2, ArrowDown, Check, LoaderCircle } from "lucide-react";
import { pricingRequestSchema, PRICE_BOOK_CURRENCIES, type PriceBookId, type PricingCurrency, type AuthUser, type PricingRequest } from "@nbs/shared";
import { useAuth } from "@/providers/auth-provider";
import { useI18n } from "@/i18n/provider";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { EnumSelect } from "@/components/crm/selects";
import { cn } from "@/lib/utils";
import { initialPricingCurrency, savedDisplaySnapshot, assertPricingVersions, canSavePricing, configurationForCopy, planPricingModuleChange, pricingActorKey, pricingPricesOptions, savedEstimateOptions, togglePricingModule, type PricingCatalog, type PricingPrices, type SavedEstimate } from "@/lib/pricing";
import { authorizedBooksOptions,nativeBookBundleOptions,nativeConfigurationForCopy,type NativeBookContext,type AuthorizedBooks } from "@/lib/price-book-pricing";
import { useLivePricing } from "@/lib/pricing-live";
import { JodAmount, PricingCurrencyProvider, ExchangeDetails, PriceBreakdown, PricingError, PricingLayout, PricingLoading, usePricingLabels } from "./pricing-shared";
import { CatalogPrice, OptionCard, WorkspaceSection } from "./pricing-options";
import { PricingSaveDialog } from "./pricing-save-dialog";

const productIcons = { erp: Boxes, pos: ShoppingCart, ims: Layers3, custom: Code2 };
export function PricingWorkspace() {
 const {user}=useAuth();const {t}=useI18n();const sourceId=useSearchParams().get("copy")??"";
 const access=useQuery(authorizedBooksOptions(user));const source=useQuery(savedEstimateOptions(user,sourceId));
 return <PricingLayout>{access.isError?<PricingError error={access.error} retry={()=>{void access.refetch();}}/>:!access.data?<PricingLoading/>:sourceId&&source.isError?<PricingError error={source.error} retry={()=>{void source.refetch();}}/>:sourceId&&!source.data?<PricingLoading/>:access.data.bookIds.length===0?<p role="alert">{t("pricing.noBooks")}</p>:<NativeWorkspaceReady key={JSON.stringify([...pricingActorKey(user),sourceId])} user={user} access={access.data} source={sourceId?source.data:undefined}/>}</PricingLayout>;
}
function NativeWorkspaceReady({user,access,source}:{user:AuthUser|null;access:AuthorizedBooks;source?:SavedEstimate}){
 const {t,dir}=useI18n();const prior=source?savedDisplaySnapshot(source.result)?.priceBook?.id:undefined;
 const [choice,setChoice]=useState<PriceBookId|null>(()=>prior&&access.bookIds.includes(prior)?prior:access.defaultBookId);
 const bundle=useQuery({...nativeBookBundleOptions(user,choice,access),refetchOnWindowFocus:false,refetchOnReconnect:false,staleTime:Infinity});
 if(!bundle.data)return <div className="space-y-5"><label htmlFor="initial-price-book">{t("pricing.chooseBook")}</label><EnumSelect id="initial-price-book" dir={dir} value={choice} onChange={value=>{if(value)setChoice(value);}} options={access.books.filter(b=>b.published).map(b=>({value:b.id,label:t('pricing.books.'+b.id)+' · '+b.currency}))}/>{bundle.isError?<PricingError error={bundle.error} retry={()=>{void bundle.refetch();}}/>:<PricingLoading/>}</div>;
 if(source&&!nativeConfigurationForCopy(source,bundle.data.catalog))return <p role="alert">{t("pricing.unsupportedCopy")}</p>;
 return <PricingDraft user={user} catalog={bundle.data.catalog} prices={bundle.data.prices} source={source} native={{access,reference:bundle.data.reference}}/>;
}

export function PricingDraft({ user, catalog, prices: basePrices, source, native }: { user: AuthUser | null; catalog: PricingCatalog; prices: PricingPrices; source?: SavedEstimate; native?:NativeBookContext }) {
  const { t, dir } = useI18n(); const label = usePricingLabels();
  const [legacyCurrency, setCurrency] = useState<PricingCurrency>(() => source ? savedDisplaySnapshot(source.result)?.currency ?? "JOD" : initialPricingCurrency(user));
  const [bookId,setBookId]=useState<PriceBookId>(native?.reference.id??"JO");
  const currency=native?PRICE_BOOK_CURRENCIES[bookId]:legacyCurrency;
  const nativeAuthorized=!native||native.access.bookIds.includes(bookId);
  const nativeOptions=native?nativeBookBundleOptions(user,bookId,native.access):null;
  const legacyOptions=pricingPricesOptions(user,currency);
  const convertedPrices=useQuery<PricingPrices & {nativeBook?:NativeBookContext["reference"]}>({
   queryKey:nativeOptions?[...nativeOptions.queryKey,"draft-prices"]:legacyOptions.queryKey, enabled:nativeOptions?.enabled??legacyOptions.enabled,retry:false,refetchOnWindowFocus:true,
   queryFn:async()=>{if(nativeOptions){const bundle=await nativeOptions.queryFn();return{...bundle.prices,nativeBook:bundle.reference};}return legacyOptions.queryFn();},
   initialData:native?(nativeAuthorized&&bookId===native.reference.id&&native.access.books.find(b=>b.id===bookId)?.version===native.reference.version?{...basePrices,nativeBook:native.reference}:undefined):currency==="JOD"?basePrices:undefined,
  });
  const activeBook=native?(nativeAuthorized&&convertedPrices.data?.nativeBook?.id===bookId?convertedPrices.data.nativeBook:null):undefined;
  const prices = convertedPrices.data ?? basePrices;
  const [configuration, setConfiguration] = useState<PricingRequest>(() => source ? (native?nativeConfigurationForCopy(source,catalog)!:configurationForCopy(source, catalog)!) : structuredClone(prices.products[0].initialConfiguration));
  const [saveOpen, setSaveOpen] = useState(false); const [busy, setBusy] = useState(false); const [notice, setNotice] = useState("");
  const [pending, setPending] = useState<(ReturnType<typeof planPricingModuleChange> & { id: PricingRequest["modules"][number] }) | null>(null);
  const live = useLivePricing(user, configuration, currency, convertedPrices.data?.exchange?.retrievedAt ?? "", activeBook);
  const displayEstimate = live.estimate?.currency === currency ? live.estimate : null;
  const current = live.current && !convertedPrices.isError && nativeAuthorized;
  const update = (patch: Partial<PricingRequest>) => setConfiguration(value => ({ ...value, ...patch }));
  const names = (ids: readonly string[]) => ids.map(id => label(id)).join(" · ");
  const quote = (kind: "products" | "modules" | "presets" | "addons" | "customModuleTiers" | "customSoftwareTiers", id: string) => prices[kind].find(item => item.id === id)?.quote;
  const toggle = <T extends string,>(values: T[], id: T) => values.includes(id) ? values.filter(value => value !== id) : [...values, id];
  const changeModule = (id: PricingRequest["modules"][number]) => {
    const plan = planPricingModuleChange(catalog, configuration.modules, id, !configuration.modules.includes(id));
    if (plan.added.length || plan.removed.length || plan.alternatives.length) setPending({ ...plan, id });
    else { update({ modules: plan.modules }); setNotice(""); }
  };
  const confirmModules = (alternative?: PricingRequest["modules"][number]) => {
    if (!pending) return;
    const modules = alternative ? togglePricingModule(catalog, pending.modules, alternative, true) : pending.modules;
    update({ modules }); setNotice(t(pending.removed.length ? "pricing.removedWithDependencies" : "pricing.addedWithDependencies", { names: names(pending.removed.length ? pending.removed : modules.filter(id => !configuration.modules.includes(id))) })); setPending(null);
  };
  const modules = catalog.modules.filter(item => item.product === configuration.product);
  const moduleGroups = configuration.product === "erp" ? [...prices.moduleGroups, { id: "additional", ids: modules.filter(item => !prices.moduleGroups.some(group => group.ids.includes(item.id))).map(item => item.id) }] : [{ id: "foundation", ids: modules.map(item => item.id) }];
  const addonGroups = [...prices.addonGroups, { id: "additional", ids: catalog.addons.filter(item => !prices.addonGroups.some(group => group.ids.includes(item.id))).map(item => item.id) }];
  const invalid = !pricingRequestSchema.safeParse(configuration).success;
  const summaryLabel = current ? "pricing.total" : displayEstimate ? "pricing.previousEstimate" : "pricing.liveEstimate";
  const legacySelector = <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs text-muted-foreground">{t(currency === "JOD" ? "pricing.jodBasis" : "pricing.convertedHint")}</p><div className="flex items-center gap-3"><label htmlFor="pricing-currency" className="shrink-0 text-xs font-medium">{t("pricing.displayCurrency")}</label><EnumSelect id="pricing-currency" dir={dir} disabled={busy} value={currency} onChange={value => { if (value === "JOD" || value === "USD" || value === "GBP") setCurrency(value); }} options={["JOD", "USD", "GBP"].map(value => ({ value, label: value }))} /></div></div>;
  const selector=native?<div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs text-muted-foreground">{t("pricing.nativeHint")}</p><div className="flex items-center gap-3"><label htmlFor="pricing-book" className="shrink-0 text-xs font-medium">{t("pricing.chooseBook")}</label><EnumSelect id="pricing-book" dir={dir} disabled={busy} value={bookId} onChange={value=>{if(value&&native.access.bookIds.includes(value))setBookId(value);}} options={native.access.books.filter(b=>b.published).map(b=>({value:b.id,label:t('pricing.books.'+b.id)+' · '+b.currency}))}/></div></div>:legacySelector;
  if(native&&!nativeAuthorized)return <div>{selector}<p role="alert">{t("pricing.bookDenied")}</p></div>;
  let versionError: unknown;
  if (convertedPrices.data) { try { assertPricingVersions(catalog, convertedPrices.data, currency); } catch (error) { versionError = error; } }
  if (versionError) return <div>{selector}<PricingError context="service" error={versionError} retry={() => { void convertedPrices.refetch(); }} /></div>;
  if (!convertedPrices.data || convertedPrices.data.currency !== currency || native && !activeBook) return <div>{selector}{convertedPrices.isError ? <PricingError error={convertedPrices.error} retry={() => { void convertedPrices.refetch(); }} /> : <PricingLoading />}</div>;
  return <PricingCurrencyProvider value={currency}><div className="relative min-w-0 pb-24 lg:pb-0">{selector}{native && activeBook && <p role="status" className="mb-6 text-sm text-muted-foreground">{t(activeBook.reviewStatus==="draft_v1"?"pricing.draftV1":"pricing.internalCatalog")}</p>}{convertedPrices.data.exchange && <div className="mb-6"><ExchangeDetails exchange={convertedPrices.data.exchange} /></div>}{convertedPrices.isError && <PricingError error={convertedPrices.error} retry={() => { void convertedPrices.refetch(); }} />}
    {source && <p className="mb-6 text-sm text-muted-foreground" role="status">{t(native?"pricing.nativeCopyHint":"pricing.copyHint")}</p>}
    <div className="grid min-w-0 items-start gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] xl:gap-12 xl:grid-cols-[minmax(0,1fr)_25rem]">
      <div className="min-w-0 space-y-10">
        <WorkspaceSection step="01" title={t("pricing.chooseProduct")} hint={t("pricing.productHint")}>
          <div className="grid gap-3 sm:grid-cols-2">{catalog.products.map(id => { const Icon = productIcons[id]; const price = prices.products.find(item => item.id === id); return <OptionCard key={id} selected={configuration.product === id} title={label(id, "product")} quote={price?.quote} footer={<><span className="block">{t(`pricing.startNotes.${price?.noteKey}`)}</span></>} icon={<Icon className="size-5" aria-hidden="true" />} disabled={busy} onClick={() => { if (configuration.product !== id) { setConfiguration(structuredClone(prices.products.find(item => item.id === id)!.initialConfiguration)); setNotice(""); } }}><span>{t(`pricing.productDescriptions.${id}`)}</span></OptionCard>; })}</div>
        </WorkspaceSection>
        <WorkspaceSection step="02" title={t(configuration.product === "custom" ? "pricing.customSoftware" : "pricing.choosePreset")} hint={t(configuration.product === "custom" ? "pricing.scopeHint" : "pricing.presetHint")}>
          {configuration.product === "custom" ? <div className="grid gap-3 sm:grid-cols-3">{catalog.customSoftwareTiers.map(id => <OptionCard key={id} title={label(id, "custom-software")} quote={quote("customSoftwareTiers", id)} selected={configuration.customSoftwareTier === id} onClick={() => update({ customSoftwareTier: id })} disabled={busy} />)}</div> : <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">{catalog.presets.filter(item => item.product === configuration.product).map(item => { const price = prices.presets.find(price => price.id === item.id); const selected = item.moduleIds.length === configuration.modules.length && item.moduleIds.every(id => configuration.modules.includes(id)); return <OptionCard key={item.id} title={label(item.id, "preset")} quote={price?.quote} footer={price && price.savings > 0 ? <span className="font-medium text-emerald-600 dark:text-emerald-400">{t("pricing.savings")} <JodAmount value={price.savings} /></span> : undefined} selected={selected} disabled={busy} onClick={() => { update({ modules: [...item.moduleIds] }); setNotice(t("pricing.presetSelected")); }}><span className="block">{names(item.moduleIds)}</span></OptionCard>; })}</div>}
        </WorkspaceSection>
        {configuration.product !== "custom" && <WorkspaceSection step="03" title={t("pricing.configureModules")} hint={t("pricing.modulesHint")}>
          {moduleGroups.map(group => { const items = modules.filter(item => group.ids.includes(item.id)); if (!items.length) return null; return <div key={group.id} className="space-y-3"><h3 className="text-xs font-semibold tracking-wide text-muted-foreground">{t(`pricing.groups.${group.id}`)}</h3><div className="grid gap-2 sm:grid-cols-2">{items.map(item => <OptionCard key={item.id} compact selected={configuration.modules.includes(item.id)} title={label(item.id)} quote={quote("modules", item.id)} disabled={busy || item.required} onClick={() => changeModule(item.id)}>
            {item.required && <span className="inline-flex items-center gap-1"><Check className="size-3" />{t("pricing.includedCore")}</span>}
            {item.requires.length > 0 && <span className="block">{t("pricing.requires", { names: names(item.requires) })}</span>}{item.requiresAnyOf.length > 0 && <span className="block">{t("pricing.chooseOne", { names: names(item.requiresAnyOf) })}</span>}
            {item.recommends.length > 0 && <span className="block">{t("pricing.recommends", { names: names(item.recommends) })}</span>}{item.honesty && item.honesty !== "complete" && <span className="block">{t(`pricing.honesty.${item.honesty}`)}</span>}
          </OptionCard>)}</div></div>; })}
        </WorkspaceSection>}
        <WorkspaceSection step={configuration.product === "custom" ? "03" : "04"} title={t("pricing.enhancements")} hint={t("pricing.enhancementsHint")}>
          {addonGroups.map(group => { const items = catalog.addons.filter(item => group.ids.includes(item.id)); if (!items.length) return null; return <div key={group.id} className="space-y-3"><h3 className="text-xs font-semibold tracking-wide text-muted-foreground">{t(`pricing.groups.${group.id}`)}</h3><div className="grid gap-2 sm:grid-cols-2">{items.map(item => <OptionCard key={item.id} compact title={label(item.id, "addon")} quote={quote("addons", item.id)} selected={configuration.addons.includes(item.id)} disabled={busy} onClick={() => update({ addons: toggle(configuration.addons, item.id) })}>{item.externalCostNote && <span>{t("pricing.externalCost")}</span>}</OptionCard>)}</div></div>; })}
          <details className="border-t border-border/60 pt-4"><summary className="cursor-pointer text-sm font-medium">{t("pricing.customModules")} <span className="text-muted-foreground">{configuration.customModuleTier.length > 0 && `(${configuration.customModuleTier.length})`}</span></summary><div className="mt-4 grid gap-3 sm:grid-cols-3">{catalog.customModuleTiers.map(id => <OptionCard key={id} compact title={label(id, "custom-module")} quote={quote("customModuleTiers", id)} selected={configuration.customModuleTier.includes(id)} disabled={busy} onClick={() => update({ customModuleTier: toggle(configuration.customModuleTier, id) })} />)}</div></details>
          <details className="border-t border-border/60 pt-4"><summary className="cursor-pointer text-sm font-medium">{t("pricing.scopeNotes")}</summary><label htmlFor="pricing-scope" className="sr-only">{t("pricing.scopeNotes")}</label><Textarea className="mt-4" id="pricing-scope" maxLength={2000} value={configuration.customNotes} disabled={busy} onChange={event => update({ customNotes: event.target.value })} /></details>
        </WorkspaceSection>
        <p role="status" className="text-sm text-muted-foreground">{notice}</p>
      </div>
      <aside id="pricing-estimate" aria-label={t("pricing.liveEstimate")} className="min-w-0 scroll-mt-4 rounded-xl bg-card lg:sticky lg:top-0 lg:max-h-[calc(100dvh-8rem)] lg:overflow-y-auto">
        <div className="sticky top-0 z-10 space-y-4 border-b border-border/60 bg-card p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3"><h2 className="text-sm font-medium">{t("pricing.liveEstimate")}</h2><span className="text-xs text-muted-foreground">{currency}</span></div>
          <div aria-live="polite" aria-atomic="true"><p className="mb-1 text-xs text-muted-foreground">{t(summaryLabel)}</p><p className={cn("text-3xl font-semibold tracking-tight tabular-nums", !current && "text-muted-foreground")}>{displayEstimate ? <JodAmount value={displayEstimate.estimatedTotal} currency={displayEstimate.currency} /> : <span aria-hidden="true">—</span>}</p>
            <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">{invalid ? t("pricing.completeConfiguration") : live.status === "error" || convertedPrices.isError ? t("pricing.previousHint") : !current ? <><LoaderCircle className="size-3 animate-spin" aria-hidden="true" />{t("pricing.updating")}</> : <><Check className="size-3" aria-hidden="true" />{t("pricing.upToDate")}</>}</p>
          </div>
          {displayEstimate && <div className="space-y-2 text-xs"><p>{t("pricing.applied")}: <span className="font-medium">{displayEstimate.presetApplied ? label(displayEstimate.presetApplied, "preset") : t("pricing.noBundle")}</span></p><p className="flex flex-wrap justify-between gap-2"><span>{t("pricing.savings")}</span><JodAmount value={displayEstimate.bundleSavings} currency={displayEstimate.currency} /></p>{displayEstimate.hasStartingFromItems && <p className="text-muted-foreground">{t("pricing.minimum")}</p>}{displayEstimate.hasCustomQuotationItems && <p className="text-muted-foreground">{t("pricing.customPrice")}</p>}</div>}
          {canSavePricing(user) ? <Button className="w-full" disabled={!current || invalid || busy || convertedPrices.isError} onClick={() => setSaveOpen(true)}>{t("pricing.saveAction")}</Button> : <p className="text-xs text-muted-foreground">{t("pricing.savePermission")}</p>}
        </div>
        {live.status === "error" && <div className="p-4"><PricingError error={live.error} retry={invalid ? undefined : live.retry} /></div>}
        {displayEstimate ? <div className={cn(!current && "opacity-60")}><PriceBreakdown estimate={displayEstimate} embedded hideSummary /></div> : <div className="space-y-3 p-6 text-sm text-muted-foreground"><p>{t(invalid ? "pricing.completeConfiguration" : "pricing.updating")}</p><p className="text-xs leading-relaxed">{t("pricing.limits")}</p></div>}
      </aside>
    </div>
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 lg:hidden"><div className="mx-auto flex max-w-3xl items-center justify-between gap-3"><div className="min-w-0"><p className="text-xs text-muted-foreground">{t(summaryLabel)}</p><p className="text-lg font-semibold tabular-nums">{displayEstimate ? <JodAmount value={displayEstimate.estimatedTotal} currency={displayEstimate.currency} /> : "—"}</p></div><Button variant="outline" onClick={() => document.getElementById("pricing-estimate")?.scrollIntoView({ behavior: "smooth", block: "start" })}>{t("pricing.review")}<ArrowDown className="size-4" aria-hidden="true" /></Button></div></div>
    <Dialog open={!!pending} onOpenChange={open => { if (!open) setPending(null); }}><DialogContent dir={dir} closeLabel={t("common.close")}><DialogTitle className="pe-6">{t(pending?.removed.length ? "pricing.removalTitle" : "pricing.dependencyTitle")}</DialogTitle><DialogDescription>{t(pending?.removed.length ? "pricing.removalHint" : "pricing.dependencyHint")}</DialogDescription>
      {pending && <div className="space-y-4"><p className="text-sm font-medium">{label(pending.id)}</p><ul className="space-y-2 text-sm">{[...pending.added, ...pending.removed].map(id => <li key={id} className="flex flex-wrap justify-between gap-2"><span>{label(id)}</span><CatalogPrice quote={quote("modules", id)} /></li>)}</ul>
        {pending.alternatives.length ? <div className="space-y-3"><p className="text-sm">{t("pricing.chooseOne", { names: names(pending.alternatives) })}</p>{pending.alternatives.map(id => <Button key={id} variant="outline" className="h-auto w-full flex-wrap justify-between gap-2 py-3" onClick={() => confirmModules(id)}><span>{label(id)}</span><CatalogPrice quote={quote("modules", id)} /></Button>)}</div> : <Button onClick={() => confirmModules()}>{t("pricing.confirmChanges")}</Button>}
        <Button variant="ghost" onClick={() => setPending(null)}>{t("common.cancel")}</Button>
      </div>}
    </DialogContent></Dialog>
    {canSavePricing(user) && <PricingSaveDialog open={saveOpen} onOpenChange={setSaveOpen} user={user} configuration={configuration} displayCurrency={currency} priceBook={activeBook??undefined} current={current && !invalid && !convertedPrices.isError} source={source} onBusyChange={setBusy} />}
  </div></PricingCurrencyProvider>;
}
