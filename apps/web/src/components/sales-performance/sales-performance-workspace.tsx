"use client";

import type { SalesPerformancePeriod, SalesPerformanceSummary, SalespersonPerformance, SalespersonPerformanceDetail } from "@nbs/shared";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, BarChart3, Building2, CalendarClock, Handshake, ListChecks, PhoneCall, Target, Trophy, UsersRound, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { EmptyState, PageFrame, PageHeader, QueryPanel, Surface, TableSkeleton } from "@/components/crm/primitives";
import { AppLink } from "@/components/layout/app-link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useI18n } from "@/i18n/provider";
import { api } from "@/lib/api";
import { formatDate, formatDateTime, formatMoney, jordanDateKey } from "@/lib/format";
import { toQuery } from "@/lib/query";

type SortKey = keyof Pick<SalespersonPerformance, "assignedCompanies" | "activities" | "companiesContacted" | "followUpsCompleted" | "overdueFollowUps" | "opportunitiesCreated" | "activeOpportunities" | "won" | "lost" | "winRate" | "lastActivityAt"> | "salesperson" | "pipelineValue";

function initialCustomDates() {
  const now = new Date();
  const from = new Date(now.getTime() - 29 * 86_400_000);
  return { from: jordanDateKey(from) ?? "", to: jordanDateKey(now) ?? "" };
}

function PeriodFilter({ period, from, to, onPeriod, onFrom, onTo }: { period: SalesPerformancePeriod; from: string; to: string; onPeriod: (value: SalesPerformancePeriod) => void; onFrom: (value: string) => void; onTo: (value: string) => void }) {
  const { t } = useI18n();
  return <Surface className="flex flex-col gap-3 p-3 sm:flex-row sm:items-end">
    <label className="min-w-48 text-xs text-muted-foreground"><span className="mb-1.5 block">{t("salesPerformance.period")}</span><Select value={period} onValueChange={(value) => onPeriod(value as SalesPerformancePeriod)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="7d">{t("salesPerformance.last7")}</SelectItem><SelectItem value="30d">{t("salesPerformance.last30")}</SelectItem><SelectItem value="90d">{t("salesPerformance.last90")}</SelectItem><SelectItem value="custom">{t("salesPerformance.custom")}</SelectItem></SelectContent></Select></label>
    {period === "custom" ? <><label className="text-xs text-muted-foreground"><span className="mb-1.5 block">{t("salesPerformance.from")}</span><Input type="date" value={from} max={to || undefined} onChange={(event) => onFrom(event.target.value)} /></label><label className="text-xs text-muted-foreground"><span className="mb-1.5 block">{t("salesPerformance.to")}</span><Input type="date" value={to} min={from || undefined} onChange={(event) => onTo(event.target.value)} /></label></> : null}
  </Surface>;
}

function usePeriod(initialValues?: { period?: SalesPerformancePeriod; from?: string; to?: string }) {
  const [initial] = useState(() => initialCustomDates());
  const [period, setPeriod] = useState<SalesPerformancePeriod>(initialValues?.period ?? "30d");
  const [from, setFrom] = useState(initialValues?.from ?? initial.from);
  const [to, setTo] = useState(initialValues?.to ?? initial.to);
  const valid = period !== "custom" || (Boolean(from && to) && from <= to);
  const queryString = toQuery({ period, from: period === "custom" ? from : undefined, to: period === "custom" ? to : undefined });
  return { period, setPeriod, from, setFrom, to, setTo, valid, queryString };
}

const KPI_ICONS = [PhoneCall, Building2, ListChecks, CalendarClock, Target, Handshake, Trophy, XCircle, BarChart3];

function KpiGrid({ values }: { values: Array<{ label: string; value: string | number }> }) {
  return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">{values.map((item, index) => { const Icon = KPI_ICONS[index] ?? BarChart3; return <Surface key={item.label} className="p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-xs text-muted-foreground">{item.label}</p><p className="mt-2 text-2xl font-semibold tabular-nums">{item.value}</p></div><div className="rounded-lg bg-primary/10 p-2 text-primary"><Icon className="size-4" /></div></div></Surface>; })}</div>;
}

function winRateLabel(value: number | null) { return value == null ? "—" : `${value.toFixed(1)}%`; }

function SortButton({ label, column, sort, order, onSort }: { label: string; column: SortKey; sort: SortKey; order: "asc" | "desc"; onSort: (key: SortKey) => void }) {
  return <button type="button" className="whitespace-nowrap hover:text-foreground" onClick={() => onSort(column)}>{label}{sort === column ? (order === "asc" ? " ↑" : " ↓") : ""}</button>;
}

export function SalesPerformanceWorkspace() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const filters = usePeriod();
  const [sort, setSort] = useState<SortKey>("activities");
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const query = useQuery({ queryKey: ["sales-performance", filters.period, filters.from, filters.to], enabled: filters.valid, queryFn: () => api.get<{ performance: SalesPerformanceSummary }>(`/sales-performance${filters.queryString}`).then((result) => result.performance) });
  const rows = useMemo(() => [...(query.data?.salespeople ?? [])].sort((a, b) => {
    const av = sort === "salesperson" ? a.salesperson.name : sort === "pipelineValue" ? Number(a.pipelineValue) : a[sort];
    const bv = sort === "salesperson" ? b.salesperson.name : sort === "pipelineValue" ? Number(b.pipelineValue) : b[sort];
    const compared = av == null ? 1 : bv == null ? -1 : typeof av === "string" ? av.localeCompare(String(bv), locale) : Number(av) - Number(bv);
    return order === "asc" ? compared : -compared;
  }), [query.data?.salespeople, sort, order, locale]);
  const onSort = (key: SortKey) => { if (key === sort) setOrder((value) => value === "asc" ? "desc" : "asc"); else { setSort(key); setOrder(key === "salesperson" ? "asc" : "desc"); } };
  const overall = query.data?.overall;
  const kpis = overall ? [
    { label: t("salesPerformance.activities"), value: overall.activities }, { label: t("salesPerformance.companiesContacted"), value: overall.companiesContacted },
    { label: t("salesPerformance.followUpsCompleted"), value: overall.followUpsCompleted }, { label: t("salesPerformance.overdueFollowUps"), value: overall.overdueFollowUps },
    { label: t("salesPerformance.opportunitiesCreated"), value: overall.opportunitiesCreated }, { label: t("salesPerformance.pipelineValue"), value: formatMoney(overall.pipelineValue, locale) },
    { label: t("salesPerformance.won"), value: overall.won }, { label: t("salesPerformance.lost"), value: overall.lost }, { label: t("salesPerformance.winRate"), value: winRateLabel(overall.winRate) },
  ] : [];

  return <PageFrame width="full"><PageHeader title={t("salesPerformance.title")} description={t("salesPerformance.description")} /><PeriodFilter {...filters} onPeriod={filters.setPeriod} onFrom={filters.setFrom} onTo={filters.setTo} />
    <QueryPanel query={query} skeleton={<><div className="grid gap-3 sm:grid-cols-3"><Surface className="h-24 animate-pulse"><span /></Surface><Surface className="h-24 animate-pulse"><span /></Surface><Surface className="h-24 animate-pulse"><span /></Surface></div><TableSkeleton rows={5} cols={6} /></>} isEmpty={() => false}>{() => <><KpiGrid values={kpis} /><div><h3 className="mb-3 text-base font-semibold">{t("salesPerformance.salespeople")}</h3>{rows.length === 0 ? <EmptyState icon={UsersRound} title={t("salesPerformance.noSalespeople")} description={t("salesPerformance.noSalespeopleDescription")} /> : <Surface className="overflow-hidden"><Table className="min-w-[1500px]"><TableHeader><TableRow className="bg-muted/35 hover:bg-muted/35"><TableHead><SortButton label={t("salesPerformance.salesperson")} column="salesperson" {...{ sort, order, onSort }} /></TableHead>{(["assignedCompanies", "activities", "companiesContacted", "followUpsCompleted", "overdueFollowUps", "opportunitiesCreated", "activeOpportunities", "pipelineValue", "won", "lost", "winRate", "lastActivityAt"] as SortKey[]).map((key) => <TableHead key={key}><SortButton label={t(`salesPerformance.${key}`)} column={key} {...{ sort, order, onSort }} /></TableHead>)}</TableRow></TableHeader><TableBody>{rows.map((row) => <TableRow key={row.salesperson.id} className="cursor-pointer" tabIndex={0} onClick={() => router.push(`/admin/sales-performance/${row.salesperson.id}${filters.queryString}`)} onKeyDown={(event) => { if (event.key === "Enter") router.push(`/admin/sales-performance/${row.salesperson.id}${filters.queryString}`); }}><TableCell className="font-medium">{row.salesperson.name}</TableCell><TableCell>{row.assignedCompanies}</TableCell><TableCell>{row.activities}</TableCell><TableCell>{row.companiesContacted}</TableCell><TableCell>{row.followUpsCompleted}</TableCell><TableCell>{row.overdueFollowUps}</TableCell><TableCell>{row.opportunitiesCreated}</TableCell><TableCell>{row.activeOpportunities}</TableCell><TableCell>{formatMoney(row.pipelineValue, locale)}</TableCell><TableCell>{row.won}</TableCell><TableCell>{row.lost}</TableCell><TableCell>{winRateLabel(row.winRate)}</TableCell><TableCell className="whitespace-nowrap">{formatDateTime(row.lastActivityAt, locale)}</TableCell></TableRow>)}</TableBody></Table></Surface>}</div></>}</QueryPanel>
  </PageFrame>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) { return <Surface className="overflow-hidden"><h3 className="border-b border-border px-4 py-3 text-sm font-semibold">{title}</h3><div className="p-4">{children}</div></Surface>; }
function EmptyText({ children }: { children: React.ReactNode }) { return <p className="py-4 text-center text-sm text-muted-foreground">{children}</p>; }

export function SalespersonPerformanceView({ userId, initialPeriod, initialFrom, initialTo }: { userId: string; initialPeriod?: SalesPerformancePeriod; initialFrom?: string; initialTo?: string }) {
  const { t, locale } = useI18n();
  const filters = usePeriod({ period: initialPeriod, from: initialFrom, to: initialTo });
  const query = useQuery({ queryKey: ["sales-performance", userId, filters.period, filters.from, filters.to], enabled: filters.valid, queryFn: () => api.get<{ performance: SalespersonPerformanceDetail }>(`/sales-performance/${userId}${filters.queryString}`).then((result) => result.performance) });
  const data = query.data;
  const maxTrend = Math.max(1, ...(data?.activityTrend.map((item) => item.count) ?? [1]));
  const kpis = data ? [
    { label: t("salesPerformance.assignedCompanies"), value: data.kpis.assignedCompanies }, { label: t("salesPerformance.activities"), value: data.kpis.activities },
    { label: t("salesPerformance.companiesContacted"), value: data.kpis.companiesContacted }, { label: t("salesPerformance.followUpsCompleted"), value: data.kpis.followUpsCompleted },
    { label: t("salesPerformance.overdueFollowUps"), value: data.kpis.overdueFollowUps }, { label: t("salesPerformance.opportunitiesCreated"), value: data.kpis.opportunitiesCreated },
    { label: t("salesPerformance.activeOpportunities"), value: data.kpis.activeOpportunities }, { label: t("salesPerformance.pipelineValue"), value: formatMoney(data.kpis.pipelineValue, locale) },
    { label: t("salesPerformance.won"), value: data.kpis.won }, { label: t("salesPerformance.lost"), value: data.kpis.lost }, { label: t("salesPerformance.winRate"), value: winRateLabel(data.kpis.winRate) },
  ] : [];
  const BackIcon = locale === "ar" ? ArrowRight : ArrowLeft;
  return <PageFrame width="wide"><PageHeader title={data?.salesperson.name ?? t("salesPerformance.detailsTitle")} description={t("salesPerformance.detailsDescription")} actions={<Button variant="outline" asChild><AppLink href="/admin/sales-performance"><BackIcon className="size-4" />{t("common.back")}</AppLink></Button>} /><PeriodFilter {...filters} onPeriod={filters.setPeriod} onFrom={filters.setFrom} onTo={filters.setTo} />
    <QueryPanel query={query} skeleton={<TableSkeleton rows={6} cols={4} />} isEmpty={() => false}>{(performance) => <><KpiGrid values={kpis} /><div className="grid gap-4 lg:grid-cols-2"><Section title={t("salesPerformance.activityBreakdown")}><div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{performance.activityBreakdown.map((item) => <div key={item.type} className="rounded-lg bg-muted/50 p-3"><p className="text-xs text-muted-foreground">{t(`enums.activityType.${item.type}`)}</p><p className="mt-1 text-xl font-semibold">{item.count}</p></div>)}</div></Section><Section title={t("salesPerformance.activityTrend")}>{performance.activityTrend.length === 0 ? <EmptyText>{t("salesPerformance.noPeriodData")}</EmptyText> : <div className="flex h-40 items-end gap-1 overflow-x-auto" aria-label={t("salesPerformance.activityTrend")}>{performance.activityTrend.map((item) => <div key={item.date} className="flex min-w-8 flex-1 flex-col items-center justify-end gap-1"><span className="text-[10px] tabular-nums">{item.count}</span><div className="w-full max-w-10 rounded-t bg-primary/75" style={{ height: `${Math.max(8, item.count / maxTrend * 110)}px` }} /><span className="text-[10px] text-muted-foreground">{formatDate(`${item.date}T12:00:00Z`, locale)}</span></div>)}</div>}</Section>
      <Section title={t("salesPerformance.recentActivities")}>{performance.recentActivities.length === 0 ? <EmptyText>{t("salesPerformance.noPeriodData")}</EmptyText> : <div className="divide-y divide-border">{performance.recentActivities.map((item) => <div key={item.id} className="py-3 first:pt-0 last:pb-0"><div className="flex justify-between gap-3"><span className="font-medium">{item.company.name}</span><span className="whitespace-nowrap text-xs text-muted-foreground">{formatDateTime(item.occurredAt, locale)}</span></div><p className="mt-1 text-sm text-muted-foreground">{t(`enums.activityType.${item.type}`)} · {item.summary}</p></div>)}</div>}</Section>
      <Section title={t("salesPerformance.assignedCompanies")}>{performance.assignedCompanies.length === 0 ? <EmptyText>{t("salesPerformance.none")}</EmptyText> : <div className="grid gap-2 sm:grid-cols-2">{performance.assignedCompanies.map((company) => <AppLink key={company.id} href={`/companies/${company.id}`} className="rounded-lg border border-border p-3 hover:bg-muted/50"><p className="font-medium">{company.name}</p><p className="text-xs text-muted-foreground">{company.sector ?? t("common.noSector")}</p></AppLink>)}</div>}</Section>
      <Section title={t("salesPerformance.activeOpportunities")}>{performance.activeOpportunities.length === 0 ? <EmptyText>{t("salesPerformance.none")}</EmptyText> : <div className="divide-y divide-border">{performance.activeOpportunities.map((opportunity) => <AppLink key={opportunity.id} href={`/opportunities/${opportunity.id}`} className="flex justify-between gap-3 py-3 first:pt-0 last:pb-0"><span><span className="font-medium">{opportunity.name}</span><span className="block text-xs text-muted-foreground">{opportunity.company.name} · {t(`enums.opportunityStage.${opportunity.stage}`)}</span></span><span className="tabular-nums">{formatMoney(opportunity.estimatedValue, locale)}</span></AppLink>)}</div>}</Section>
      <Section title={t("salesPerformance.wonLostOutcomes")}>{performance.closedOpportunities.length === 0 ? <EmptyText>{t("salesPerformance.noPeriodData")}</EmptyText> : <div className="divide-y divide-border">{performance.closedOpportunities.map((opportunity) => <AppLink key={opportunity.id} href={`/opportunities/${opportunity.id}`} className="flex justify-between gap-3 py-3 first:pt-0 last:pb-0"><span><span className="font-medium">{opportunity.name}</span><span className="block text-xs text-muted-foreground">{opportunity.company.name} · {formatDate(opportunity.closedAt, locale)}</span></span><span className={opportunity.stage === "WON" ? "text-success" : "text-destructive"}>{t(`enums.opportunityStage.${opportunity.stage}`)}</span></AppLink>)}</div>}</Section>
      <Section title={t("salesPerformance.overdueFollowUps")}>{performance.overdueFollowUps.length === 0 ? <EmptyText>{t("salesPerformance.none")}</EmptyText> : <div className="divide-y divide-border">{performance.overdueFollowUps.map((task) => <div key={task.id} className="flex justify-between gap-3 py-3 first:pt-0 last:pb-0"><span><span className="font-medium">{task.title}</span><span className="block text-xs text-muted-foreground">{task.company?.name ?? "—"}</span></span><span className="whitespace-nowrap text-xs text-destructive">{formatDateTime(task.dueAt, locale)}</span></div>)}</div>}</Section>
    </div><p className="text-xs text-muted-foreground">{t("salesPerformance.lastActivity")}: {formatDateTime(performance.kpis.lastActivityAt, locale)}</p></>}</QueryPanel>
  </PageFrame>;
}
