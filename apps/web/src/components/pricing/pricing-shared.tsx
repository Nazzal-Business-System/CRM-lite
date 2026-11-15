"use client";
import { createContext, useContext, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Calculator, History, Plus, AlertCircle } from "lucide-react";
import { AppLink } from "@/components/layout/app-link";
import { DestinationReady } from "@/components/layout/destination-ready";
import { PageFrame, PageHeader, Surface } from "@/components/crm/primitives";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/i18n/provider";
import { ApiError } from "@/lib/api";
import { pricingErrorKey, type EstimateSnapshot } from "@/lib/pricing";
import type { PricingCurrency, PricingExchange } from "@nbs/shared";
import { cn } from "@/lib/utils";

export function usePricingLabels() {
  const { t } = useI18n();
  return (id: string, kind = "module") => {
    const group = ({ module: "moduleNames", preset: "presetNames", addon: "addonNames", "custom-module": "customModuleNames", "custom-software": "customSoftwareNames", product: "productNames" } as Record<string, string>)[kind] ?? "moduleNames";
    const key = `pricing.${group}.${id}`; const value = t(key); return value === key ? id : value;
  };
}
export function PricingLayout({ children }: { children: ReactNode }) {
  const { t } = useI18n(); const saved = usePathname().startsWith("/pricing/estimates");
  return <PageFrame width="wide"><DestinationReady ready /><PageHeader title={t(saved ? "pricing.saved" : "pricing.title")} description={t(saved ? "pricing.savedDescription" : "pricing.description")} actions={saved && <Button asChild><AppLink href="/pricing"><Plus className="size-4" aria-hidden="true" />{t("pricing.builder")}</AppLink></Button>} />
    <PricingNavigation saved={saved} />
    <p className="text-xs text-muted-foreground">{t("pricing.internal")}</p>{children}</PageFrame>;
}
export function PricingNavigation({ saved }: { saved: boolean }) {
  const { t } = useI18n();
  return <nav aria-label={t("pricing.title")} className="flex border-b border-border/60 pb-4"><div className="inline-flex max-w-full flex-wrap gap-1 rounded-lg bg-muted/50 p-1">
    {([{ href: "/pricing", key: "pricing.configure", active: !saved, Icon: Calculator }, { href: "/pricing/estimates", key: "pricing.saved", active: saved, Icon: History }] as const).map(({ href, key, active, Icon }) => <AppLink key={href} href={href} aria-current={active ? "page" : undefined} className={cn("inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring", active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:bg-background/50 hover:text-foreground")}><Icon className="size-4" aria-hidden="true" />{t(key)}</AppLink>)}
  </div></nav>;
}
export function PricingError({ error, retry, context = "record" }: { error: unknown; retry?: () => void; context?: "service" | "record" }) {
  const { t } = useI18n();
  // Context also handles an error cached before the endpoint-aware transport was loaded.
  const missingService = error instanceof ApiError && error.status === 404 && (context === "service" || error.code === "PRICING_ENDPOINT_MISSING");
  const blocked = error instanceof ApiError && (error.status === 403 || error.status === 404 && !missingService);
  return <div role="alert" className="flex items-start gap-3 rounded-lg bg-muted/40 p-4 text-sm"><AlertCircle className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" /><div className="space-y-3"><p className="leading-relaxed">{t(missingService ? "pricing.endpointMissing" : pricingErrorKey(error))}</p>{retry && !blocked && <Button type="button" variant="outline" onClick={retry}>{t("common.retry")}</Button>}{error instanceof ApiError && error.status === 404 && !missingService && <Button asChild variant="outline"><AppLink href="/pricing/estimates">{t("pricing.backToSaved")}</AppLink></Button>}</div></div>;
}
export function PricingLoading() { const { t } = useI18n(); return <><DestinationReady ready={false} /><p role="status" className="animate-pulse p-4 text-sm text-muted-foreground">{t("pricing.loading")}</p></>; }
const PricingCurrencyContext = createContext<PricingCurrency>("JOD");
export const PricingCurrencyProvider = PricingCurrencyContext.Provider;
export function JodAmount({ value, currency: explicit }: { value: number; currency?: string }) {
  const selected = useContext(PricingCurrencyContext); const currency = explicit ?? selected;
  const { locale } = useI18n();
  return <bdi>{new Intl.NumberFormat(locale === "ar" ? "ar-JO" : "en-JO", { style: "currency", currency, currencyDisplay: "code", minimumFractionDigits: currency === "JOD" ? 0 : 2, maximumFractionDigits: currency === "JOD" ? 3 : 2 }).format(value)}</bdi>;
}
export function PriceBreakdown({ estimate, embedded = false, hideSummary = false }: { estimate: EstimateSnapshot; embedded?: boolean; hideSummary?: boolean }) {
  const { t } = useI18n(); const label = usePricingLabels();
  const money = (value: number) => <JodAmount value={value} currency={estimate.currency} />;
  const Container = embedded ? "div" : Surface;
  return <Container className="min-w-0 space-y-4 p-4 sm:p-6">
    <h2 className="font-semibold">{t("pricing.lineItems")}</h2>
    <dl className="divide-y divide-border">{estimate.lineItems.map((line, index) => <div key={`${line.kind}-${line.id}-${index}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 py-3 text-sm">
      <dt className="min-w-0 break-words"><span>{label(line.id, line.kind)}</span><div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
        {line.isEstimateFloor && <span>{t("pricing.minimum")}</span>}{line.quote.kind === "per_session" && <span>{t("pricing.perSession")}</span>}{line.quote.kind === "custom_quotation" && <span>{t("pricing.customPrice")}</span>}
      </div></dt><dd className="text-end tabular-nums">{money(line.amount)}</dd></div>)}</dl>
    {!hideSummary && <dl className="space-y-3 border-t border-border pt-4 text-sm">
      <div className="flex flex-wrap justify-between gap-2"><dt>{t("pricing.components")}</dt><dd>{money(estimate.componentOnlyTotal)}</dd></div>
      <div className="flex flex-wrap justify-between gap-2"><dt>{t("pricing.savings")}</dt><dd>{money(estimate.bundleSavings)}</dd></div>
      <div className="flex flex-wrap justify-between gap-2"><dt>{t("pricing.applied")}</dt><dd className="break-words">{estimate.presetApplied ? label(estimate.presetApplied, "preset") : t("pricing.noBundle")}</dd></div>
      <div className="flex flex-wrap justify-between gap-2 text-lg font-semibold"><dt>{t("pricing.total")}</dt><dd>{money(estimate.estimatedTotal)}</dd></div>
    </dl>}
    <div className="flex flex-wrap gap-2">{estimate.hasStartingFromItems && <Badge variant="secondary">{t("pricing.minimum")}</Badge>}{estimate.hasCustomQuotationItems && <Badge variant="outline">{t("pricing.customPrice")}</Badge>}</div>
    <p className="text-xs leading-relaxed text-muted-foreground">{t("pricing.limits")}</p>
    {estimate.priceBook?.reviewStatus==="draft_v1" && <p className="text-xs text-muted-foreground">{t("pricing.draftV1")}</p>}
    {estimate.pricingBasis === "PRICE_BOOK" && estimate.priceBook && <p className="text-xs text-muted-foreground">{t("pricing.nativeBook")}: <bdi>{estimate.priceBook.id} · {estimate.priceBook.version}</bdi></p>}
    {estimate.exchange && <ExchangeDetails exchange={estimate.exchange} />}
    {embedded ? <details className="text-xs text-muted-foreground"><summary className="cursor-pointer rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">{t("pricing.catalogDetails")}</summary><p className="mt-2 break-all"><bdi>{estimate.catalogVersion}</bdi></p></details> : <p className="break-all text-xs text-muted-foreground">{t("pricing.catalogVersion")}: <bdi>{estimate.catalogVersion}</bdi></p>}
  </Container>;
}

export function ExchangeDetails({ exchange }: { exchange: PricingExchange }) { const { t, locale } = useI18n(); return <details className="text-xs leading-relaxed text-muted-foreground"><summary className="cursor-pointer rounded-sm focus-visible:outline-2 focus-visible:outline-ring">{t("pricing.exchangeDetails")}</summary><div className="mt-2 space-y-1"><p>{t(exchange.currency === "JOD" ? "pricing.jodBasis" : "pricing.convertedHint")}</p>{exchange.currency !== "JOD" && <><p><a href={exchange.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{exchange.source}</a> · <bdi>{exchange.effectiveDate}</bdi></p><p><bdi>1 JOD = {new Intl.NumberFormat(locale === "ar" ? "ar" : "en", { maximumFractionDigits: 8 }).format(exchange.rate)} {exchange.currency}</bdi></p><p>{t("pricing.roundingHint")}</p></>}</div></details>; }
