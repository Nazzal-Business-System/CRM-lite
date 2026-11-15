"use client";
import { useQuery } from "@tanstack/react-query";
import { Boxes, ShoppingCart, Layers3, ExternalLink, ArrowUpRight, Globe, Check, Compass } from "lucide-react";
import type { Demo, DemoResource } from "@nbs/shared";
import { useAuth } from "@/providers/auth-provider";
import { useI18n } from "@/i18n/provider";
import { PageFrame, PageHeader } from "@/components/crm/primitives";
import { DestinationReady } from "@/components/layout/destination-ready";
import { Button, buttonVariants } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import { demoQueryOptions } from "@/lib/demos";
import { cn } from "@/lib/utils";

const icons = { erp: Boxes, pos: ShoppingCart, ims: Layers3 };
const external = { target: "_blank", rel: "noopener noreferrer", referrerPolicy: "no-referrer" } as const;
const capabilityKeys = ["first", "second", "third"] as const;
export function DemoCards({ demos }: { demos: Demo[] }) {
  const { t } = useI18n();
  return <section aria-labelledby="demo-systems-title" className="space-y-5">
    <div className="flex flex-wrap items-baseline justify-between gap-2"><div className="space-y-1"><h2 id="demo-systems-title" className="text-lg font-semibold tracking-tight">{t("demos.systemsTitle")}</h2><p className="text-sm text-muted-foreground">{t("demos.systemsHint")}</p></div><span className="text-xs text-muted-foreground">{t("demos.systemCount", { count: demos.length })}</span></div>
    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{demos.map(demo => { const Icon = icons[demo.id]; const titleId = `demo-${demo.id}-title`; const actionId = `demo-${demo.id}-action`; return <a key={demo.id} href={demo.url} {...external} aria-labelledby={`${titleId} ${actionId}`} aria-describedby={`demo-${demo.id}-description`} className="group row-span-4 grid h-full min-w-0 cursor-pointer grid-rows-subgrid gap-5 rounded-xl border border-border/60 bg-card p-5 text-start transition-colors hover:border-primary/50 hover:bg-muted/20 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring sm:p-6">
      <div className="space-y-4"><div className="flex items-center justify-between gap-3"><Icon className="size-6 text-primary" aria-hidden="true" /><span className="text-xs font-medium text-muted-foreground">{t(`demos.systems.${demo.id}.category`)}</span></div><h3 id={titleId} className="break-words text-xl font-semibold tracking-tight">{t(`demos.systems.${demo.id}.name`)}</h3></div>
      <p id={`demo-${demo.id}-description`} className="break-words text-sm leading-relaxed text-muted-foreground">{t(`demos.systems.${demo.id}.description`)}</p>
      <div className="space-y-3"><h4 className="text-xs font-semibold text-muted-foreground">{t("demos.explore")}</h4><ul className="space-y-2.5">{capabilityKeys.map(key => <li key={key} className="flex items-start gap-2 text-sm leading-relaxed"><Check className="mt-1 size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" /><span className="min-w-0 break-words">{t(`demos.systems.${demo.id}.capabilities.${key}`)}</span></li>)}</ul></div>
      <div className="self-end space-y-4 border-t border-border/60 pt-4"><span id={actionId} className={cn(buttonVariants(), "h-auto min-h-9 w-full whitespace-normal text-center")}><span>{t("demos.open")}</span><ArrowUpRight className="size-4 rtl:-scale-x-100" aria-hidden="true" /><span className="sr-only">{t("demos.newTab")}</span></span><span className="block break-all text-xs text-muted-foreground"><bdi>{new URL(demo.url).hostname}</bdi></span></div>
    </a>; })}</div>
  </section>;
}
export function ReferenceResources({ resources }: { resources: DemoResource[] }) {
  const { t } = useI18n(); if (!resources.length) return null;
  return <section aria-labelledby="demo-reference-title" className="space-y-4"><h2 id="demo-reference-title" className="text-lg font-semibold tracking-tight">{t("demos.referencesTitle")}</h2>{resources.map(resource => <a key={resource.id} href={resource.url} {...external} aria-labelledby="demo-website-title demo-website-action" className="group grid min-w-0 cursor-pointer items-center gap-5 rounded-xl border border-border/60 bg-muted/25 p-5 transition-colors hover:border-muted-foreground/60 hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:p-6">
    <Globe className="size-7 text-muted-foreground" aria-hidden="true" /><div className="min-w-0 space-y-2"><p className="text-xs font-medium text-muted-foreground">{t("demos.referenceLabel")}</p><h3 id="demo-website-title" className="text-lg font-semibold">{t("demos.websiteName")}</h3><p className="max-w-2xl break-words text-sm leading-relaxed text-muted-foreground">{t("demos.websiteDescription")}</p><p className="break-all text-xs text-muted-foreground"><bdi>{new URL(resource.url).hostname}</bdi></p></div>
    <span id="demo-website-action" className={cn(buttonVariants({ variant: "outline" }), "w-fit")}><span>{t("demos.openWebsite")}</span><ExternalLink className="size-4 rtl:-scale-x-100" aria-hidden="true" /><span className="sr-only">{t("demos.newTab")}</span></span>
  </a>)}</section>;
}
export function DemoGuidance() {
  const { t } = useI18n();
  return <section aria-labelledby="demo-guidance-title" className="space-y-5 border-t border-border/60 pt-7"><div className="flex items-center gap-2"><Compass className="size-4 text-muted-foreground" aria-hidden="true" /><h2 id="demo-guidance-title" className="text-base font-semibold">{t("demos.guidanceTitle")}</h2></div><ol className="grid gap-5 lg:grid-cols-3">{(["discover", "walkthrough", "followup"] as const).map((key, index) => <li key={key} className="flex items-start gap-3"><span aria-hidden="true" className="pt-0.5 text-xs font-medium tabular-nums text-muted-foreground">{index + 1}</span><div className="space-y-2"><h3 className="text-sm font-medium">{t(`demos.guidance.${key}.title`)}</h3><p className="text-sm leading-relaxed text-muted-foreground">{t(`demos.guidance.${key}.body`)}</p></div></li>)}</ol><p className="max-w-4xl text-xs leading-relaxed text-muted-foreground">{t("demos.scopeNotice")}</p></section>;
}
export function DemosWorkspace() {
  const { user } = useAuth(); const { t } = useI18n(); const query = useQuery(demoQueryOptions(user));
  const denied = query.error instanceof ApiError && query.error.status === 403;
  return <PageFrame width="wide" className="space-y-8"><DestinationReady ready={!query.isPending} /><PageHeader title={t("demos.title")} description={t("demos.description")} />
    {query.isError ? <div role="alert" className="space-y-3 rounded-lg bg-muted/40 p-4 text-sm"><p>{t(denied ? "demos.denied" : "demos.unavailable")}</p>{!denied && <Button variant="outline" onClick={() => { void query.refetch(); }}>{t("common.retry")}</Button>}</div> : query.isPending || query.isFetching ? <p role="status" className="animate-pulse text-sm text-muted-foreground">{t("demos.loading")}</p> : !query.data.demos.length && !query.data.resources.length ? <p role="status" className="text-sm text-muted-foreground">{t("demos.empty")}</p> : <>
      {query.data.demos.length > 0 && <DemoCards demos={query.data.demos} />}<ReferenceResources resources={query.data.resources} /><DemoGuidance />
      <details className="text-xs text-muted-foreground"><summary className="w-fit cursor-pointer rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">{t("demos.accessDetails")}</summary><p className="mt-2 max-w-3xl leading-relaxed">{t("demos.hostNotice")}</p></details>
    </>}
  </PageFrame>;
}
