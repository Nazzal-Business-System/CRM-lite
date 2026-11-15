"use client";
import type { ReactNode } from "react";
import { Check, Plus } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import type { CatalogQuote } from "@/lib/pricing";
import { JodAmount } from "./pricing-shared";

export function CatalogPrice({ quote }: { quote?: CatalogQuote }) {
  const { t } = useI18n();
  if (!quote) return <span>{t("pricing.priceUnavailable")}</span>;
  if (quote.kind === "custom_quotation") return <span>{t("pricing.customPrice")}</span>;
  return <span className="inline-flex flex-wrap items-baseline gap-x-1.5 tabular-nums">{quote.kind === "starting_from" && <span className="text-xs font-normal text-muted-foreground">{t("pricing.from")}</span>}<JodAmount value={quote.amount} />{quote.kind === "per_session" && <span className="text-xs font-normal text-muted-foreground">{t("pricing.perSession")}</span>}</span>;
}
export function OptionCard({ selected, title, quote, children, footer, onClick, disabled, icon, compact = false }: { selected: boolean; title: string; quote?: CatalogQuote; children?: ReactNode; footer?: ReactNode; onClick: () => void; disabled?: boolean; icon?: ReactNode; compact?: boolean }) {
  // Four shared tracks align adjacent cards without fixed heights or clipping long EN/AR content.
  return <button type="button" aria-pressed={selected} disabled={disabled} onClick={onClick} className={cn("group row-span-4 grid h-full w-full min-w-0 cursor-pointer grid-rows-subgrid gap-3 rounded-xl border text-start transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-60", compact ? "p-3.5" : "p-4 sm:p-5", selected ? "border-primary/70 bg-primary/[0.07]" : "border-border/60 bg-card hover:border-muted-foreground/50 hover:bg-muted/25")}>
    <span className="flex w-full items-start justify-between gap-3"><span className="flex min-w-0 items-start gap-3">{icon && <span className={cn("shrink-0 text-muted-foreground", selected && "text-primary")}>{icon}</span>}<span className="min-w-0 break-words text-sm font-semibold">{title}</span></span><span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full", selected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>{selected ? <Check className="size-3" aria-hidden="true" /> : <Plus className="size-3" aria-hidden="true" />}</span></span>
    <span className={cn("min-w-0 self-start break-words font-semibold", compact ? "text-sm" : "text-lg tracking-tight")}><CatalogPrice quote={quote} /></span>
    <span className="block min-w-0 space-y-2 self-start break-words text-xs leading-relaxed text-muted-foreground">{children}</span>
    <span className="block min-w-0 self-end break-words text-xs leading-relaxed text-muted-foreground">{footer}</span>
  </button>;
}
export function WorkspaceSection({ step, title, hint, children }: { step: string; title: string; hint?: string; children: ReactNode }) {
  return <section className="min-w-0 space-y-4"><div className="flex items-start gap-3"><span aria-hidden="true" className="pt-0.5 text-xs font-semibold tabular-nums text-muted-foreground">{step}</span><div className="space-y-1"><h2 className="text-base font-semibold tracking-tight">{title}</h2>{hint && <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">{hint}</p>}</div></div>{children}</section>;
}
