"use client";

import type { AuditLogRecord, PaginatedResult } from "@nbs/shared";
import { useQuery } from "@tanstack/react-query";
import { ScrollText } from "lucide-react";
import { useState } from "react";
import { DataToolbar, EmptyState, PageFrame, PageHeader, PaginationBar, QueryPanel, Surface, ToolbarFilter, ToolbarSearch } from "@/components/crm/primitives";
import { EnumSelect } from "@/components/crm/selects";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { useI18n } from "@/i18n/provider";
import { api } from "@/lib/api";
import { formatDateTime, jordanDateTimeToUtc } from "@/lib/format";
import { toQuery, useDebouncedValue } from "@/lib/query";

type Response = PaginatedResult<AuditLogRecord> & { actions: string[]; entityTypes: string[]; actors: Array<{ id: string; name: string }> };

function humanize(value: string) {
  return value.toLowerCase().replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

function dateBoundary(value: string, end = false) {
  if (!value) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  return jordanDateTimeToUtc({ year: year!, month: month!, day: day!, hour: end ? 23 : 0, minute: end ? 59 : 0, second: end ? 59 : 0 });
}

export function AuditLogsPage() {
  const { t, locale } = useI18n();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [actorUserId, setActorUserId] = useState<string | null>(null);
  const [action, setAction] = useState("");
  const [entityType, setEntityType] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [selected, setSelected] = useState<AuditLogRecord | null>(null);
  const debounced = useDebouncedValue(search);
  const actionLabel = (value: string) => locale === "ar" ? t(`audit.actions.${value}`) : humanize(value);
  const entityLabel = (value: string) => locale === "ar" ? t(`audit.entities.${value}`) : humanize(value);
  const fieldLabel = (value: string) => locale === "ar" ? t(`audit.fields.${value}`) : humanize(value);
  const query = useQuery({
    queryKey: ["audit-logs", debounced, actorUserId, action, entityType, fromDate, toDate, page],
    queryFn: () => api.get<Response>(`/audit-logs${toQuery({ search: debounced, actorUserId, action, entityType, from: dateBoundary(fromDate), to: dateBoundary(toDate, true), page, pageSize: 25 })}`),
  });

  return <PageFrame width="wide">
    <PageHeader title={t("audit.title")} description={t("audit.description")} count={query.data?.total} />
    <DataToolbar>
      <ToolbarSearch value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder={t("audit.search")} loading={query.isFetching} />
      <ToolbarFilter label={t("audit.actor")}><EnumSelect allowEmpty emptyLabel={t("common.any")} value={actorUserId ?? ""} onChange={(value) => { setActorUserId(value || null); setPage(1); }} options={(query.data?.actors ?? []).map((actor) => ({ value: actor.id, label: actor.name }))} /></ToolbarFilter>
      <ToolbarFilter label={t("audit.action")}><EnumSelect allowEmpty value={action} onChange={(value) => { setAction(value); setPage(1); }} options={(query.data?.actions ?? []).map((value) => ({ value, label: actionLabel(value) }))} /></ToolbarFilter>
      <ToolbarFilter label={t("audit.module")}><EnumSelect allowEmpty value={entityType} onChange={(value) => { setEntityType(value); setPage(1); }} options={(query.data?.entityTypes ?? []).map((value) => ({ value, label: entityLabel(value) }))} /></ToolbarFilter>
      <ToolbarFilter label={t("audit.from")}><DateTimePicker value={fromDate} max={toDate || undefined} onChange={(value) => { setFromDate(value); setPage(1); }} className="h-11 rounded-none border-0 shadow-none" /></ToolbarFilter>
      <ToolbarFilter label={t("audit.to")}><DateTimePicker value={toDate} min={fromDate || undefined} onChange={(value) => { setToDate(value); setPage(1); }} className="h-11 rounded-none border-0 shadow-none" /></ToolbarFilter>
    </DataToolbar>
    <QueryPanel query={query} skeleton={<Surface className="h-64 animate-pulse"><span /></Surface>} isEmpty={(data) => data.items.length === 0} empty={<EmptyState icon={ScrollText} title={t("audit.empty")} description={t("audit.emptyDescription")} />}>
      {(data) => <>
        <Surface className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead className="border-b border-border bg-muted/35 text-start text-xs text-muted-foreground"><tr><th className="px-4 py-3 text-start">{t("audit.actor")}</th><th className="px-4 py-3 text-start">{t("audit.action")}</th><th className="px-4 py-3 text-start">{t("audit.target")}</th><th className="px-4 py-3 text-start">{t("audit.module")}</th><th className="px-4 py-3 text-start">{t("audit.date")}</th></tr></thead><tbody>{data.items.map((log) => <tr key={log.id} className="cursor-pointer border-b border-border/70 last:border-0 hover:bg-accent" onClick={() => setSelected(log)}><td className="px-4 py-3"><span className="font-medium">{log.actor.name}</span><span className="block text-xs text-muted-foreground" dir="ltr">{log.actor.email}</span></td><td className="px-4 py-3">{actionLabel(log.action)}</td><td className="px-4 py-3">{log.entityLabel ?? "—"}</td><td className="px-4 py-3">{entityLabel(log.entityType)}</td><td className="px-4 py-3 whitespace-nowrap">{formatDateTime(log.createdAt, locale)}</td></tr>)}</tbody></table></Surface>
        <PaginationBar page={data.page} pageSize={data.pageSize} total={data.total} onPageChange={setPage} />
      </>}
    </QueryPanel>
    <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>{selected ? actionLabel(selected.action) : t("audit.details")}</DialogTitle><DialogDescription>{selected ? `${selected.actor.name} · ${formatDateTime(selected.createdAt, locale)}` : ""}</DialogDescription></DialogHeader>{selected ? <div className="space-y-4 text-sm"><dl className="grid gap-3 sm:grid-cols-2"><div><dt className="text-xs text-muted-foreground">{t("audit.target")}</dt><dd>{selected.entityLabel ?? "—"}</dd></div><div><dt className="text-xs text-muted-foreground">{t("audit.module")}</dt><dd>{entityLabel(selected.entityType)}</dd></div></dl>{selected.changes.length > 0 ? <div><h3 className="mb-2 font-medium">{t("audit.changes")}</h3><div className="space-y-2">{selected.changes.map((change, index) => <div key={`${change.field}-${index}`} className="rounded-lg border border-border bg-muted/25 p-3"><span className="font-medium">{fieldLabel(change.field)}</span><div className="mt-1 grid gap-2 text-muted-foreground sm:grid-cols-2"><span>{t("audit.before")}: {String(change.before ?? "—")}</span><span>{t("audit.after")}: {String(change.after ?? "—")}</span></div></div>)}</div></div> : null}{selected.metadata ? <div><h3 className="mb-2 font-medium">{t("audit.details")}</h3><pre className="overflow-x-auto rounded-lg bg-muted p-3 text-xs whitespace-pre-wrap">{JSON.stringify(selected.metadata, null, 2)}</pre></div> : null}</div> : null}</DialogContent></Dialog>
  </PageFrame>;
}
