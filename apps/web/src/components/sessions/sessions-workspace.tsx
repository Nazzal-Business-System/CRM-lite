"use client";
import { hasPermission, PERMISSION_KEYS, type AdminSessionSummary, type PaginatedResult, type SessionSummary } from "@nbs/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LoaderCircle, Monitor, RefreshCw, Smartphone, Tablet, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { CardListSkeleton, DataToolbar, EmptyState, Fact, PageFrame, PageHeader, PaginationBar, QueryPanel, ServiceError, Surface, TableSkeleton, ToolbarFilter, ToolbarSearch } from "@/components/crm/primitives";
import { EnumSelect } from "@/components/crm/selects";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useI18n } from "@/i18n/provider";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { toQuery, useDebouncedValue } from "@/lib/query";
import { sessionDateBoundary, sessionRevocationOptions, type SessionAction } from "@/lib/session-management";
import { useAuth } from "@/providers/auth-provider";

type Item = SessionSummary | AdminSessionSummary;
function SessionDevice({ session }: { session: SessionSummary }) {
  const { t } = useI18n();
  const Icon = session.device.type === "mobile" ? Smartphone : session.device.type === "tablet" ? Tablet : Monitor;
  const browser = session.device.browser === "Unknown" ? t("sessions.unknown") : session.device.browser;
  const os = session.device.operatingSystem === "Unknown" ? t("sessions.unknown") : session.device.operatingSystem;
  return <div className="flex min-w-0 items-start gap-3">
    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"><Icon className="size-4" aria-hidden="true" /></span>
    <div className="min-w-0 space-y-1"><p className="font-medium"><bdi>{browser} · {os}</bdi></p>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><span>{t(`sessions.device.${session.device.type}`)}</span>
        {session.isCurrent && <Badge variant="secondary">{t("sessions.current")}</Badge>}
        {session.isLegacy && <span title={t("sessions.legacyHint")}>{t("sessions.legacy")}</span>}
      </div>
    </div>
  </div>;
}
function SessionStatus({ session }: { session: SessionSummary }) {
  const { t } = useI18n();
  return <Badge variant={session.status === "ACTIVE" ? "success" : "outline"}>{t(`sessions.status.${session.status}`)}</Badge>;
}
export function SessionsWorkspace({ admin = false }: { admin?: boolean }) {
  const { t, locale } = useI18n();
  const { user, endSession } = useAuth();
  const client = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [owner, setOwner] = useState<{ id: string; name: string } | null>(null);
  const [revoked, setRevoked] = useState("false");
  const [legacy, setLegacy] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [pending, setPending] = useState<SessionAction | null>(null);
  const debounced = useDebouncedValue(search);
  const canView = !admin || hasPermission(user?.permissions ?? [], PERMISSION_KEYS.SESSIONS_VIEW);
  const canRevoke = !admin || hasPermission(user?.permissions ?? [], PERMISSION_KEYS.SESSIONS_REVOKE);
  const query = useQuery({
    queryKey: ["sessions", admin ? "admin" : "mine", user?.id, page, debounced, owner?.id, revoked, legacy, from, to],
    queryFn: () => api.get<PaginatedResult<Item>>(`${admin ? "/admin/sessions" : "/auth/sessions"}${toQuery({ page, pageSize: 20,
      ...(admin ? { search: debounced, userId: owner?.id, revoked: revoked || undefined, isLegacy: legacy || undefined, createdFrom: sessionDateBoundary(from), createdTo: sessionDateBoundary(to, true) } : {}),
    })}`), enabled: Boolean(user) && canView, refetchOnWindowFocus: true,
  });
  const baseMutation = sessionRevocationOptions(client, endSession, admin);
  const mutation = useMutation({ ...baseMutation,
    onSuccess: async (result, target) => {
      setPending(null);
      if (!result.currentSessionRevoked) setPage(1);
      toast.success(t(result.currentSessionRevoked ? "sessions.signedOut" : target.kind === "others" ? "sessions.othersSuccess" : "sessions.success"));
      await baseMutation.onSuccess(result);
    }, onError: () => toast.error(t("sessions.revokeFailed")),
  });
  const disabled = mutation.isPending || query.isError;
  const date = (value: string) => <time dateTime={value}>{formatDateTime(value, locale)}</time>;
  const revokeButton = (item: Item) => canRevoke && item.status !== "REVOKED" ? <Button variant="outline" size="sm" disabled={disabled} onClick={() => { mutation.reset(); setPending({ kind: "one", session: item }); }}>{t("sessions.revoke")}</Button> : null;
  const clearFilters = () => { setSearch(""); setOwner(null); setRevoked("false"); setLegacy(""); setFrom(""); setTo(""); setPage(1); };
  const currentConfirmation = pending?.kind === "one" && pending.session.isCurrent;
  const confirmationKey = pending?.kind === "others" ? "Others" : currentConfirmation ? "Current" : "";
  return <PageFrame width={admin ? "wide" : "default"}>
    <PageHeader title={t(admin ? "sessions.adminTitle" : "sessions.myTitle")} description={t(admin ? "sessions.adminDescription" : "sessions.myDescription")} count={query.data?.total} actions={<div className="flex flex-wrap gap-2">
      <Button variant="outline" disabled={query.isFetching} onClick={() => { void query.refetch(); }}><RefreshCw className="size-4" />{t("sessions.refresh")}</Button>
      {!admin && <Button variant="outline" disabled={disabled || !query.data} onClick={() => { mutation.reset(); setPending({ kind: "others" }); }}>{t("sessions.revokeOthers")}</Button>}
    </div>} />
    {admin && <>
      <DataToolbar><ToolbarSearch value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder={t("sessions.search")} loading={query.isFetching} />
        <ToolbarFilter label={t("sessions.revocation")}><EnumSelect allowEmpty emptyLabel={t("common.any")} value={revoked} onChange={(value) => { setRevoked(value); setPage(1); }} options={[{ value: "false", label: t("sessions.notRevoked") }, { value: "true", label: t("sessions.revokedFilter") }]} /></ToolbarFilter>
        <ToolbarFilter label={t("sessions.kind")}><EnumSelect allowEmpty emptyLabel={t("common.any")} value={legacy} onChange={(value) => { setLegacy(value); setPage(1); }} options={[{ value: "false", label: t("sessions.standard") }, { value: "true", label: t("sessions.legacy") }]} /></ToolbarFilter>
      </DataToolbar>
      <Surface className="grid items-end gap-4 p-4 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_auto]">
        <div className="space-y-1.5"><label htmlFor="sessions-from" className="text-xs text-muted-foreground">{t("sessions.from")}</label><DateTimePicker id="sessions-from" value={from} max={to || undefined} onChange={(value) => { setFrom(value); setPage(1); }} /></div>
        <div className="space-y-1.5"><label htmlFor="sessions-to" className="text-xs text-muted-foreground">{t("sessions.to")}</label><DateTimePicker id="sessions-to" value={to} min={from || undefined} onChange={(value) => { setTo(value); setPage(1); }} /></div>
        <Button variant="ghost" onClick={clearFilters}>{t("sessions.clearFilters")}</Button>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground sm:col-span-2 xl:col-span-3">{owner ? <><span>{t("sessions.user")}: {owner.name}</span><Button variant="ghost" size="sm" aria-label={t("sessions.clearUser")} onClick={() => { setOwner(null); setPage(1); }}><X className="size-3" /></Button></> : t("sessions.filterNote")}</div>
      </Surface>
    </>}
    {query.isError && query.data && <ServiceError message={t("sessions.loadFailed")} onRetry={() => { void query.refetch(); }} />}
    <QueryPanel query={query} skeleton={admin ? <TableSkeleton cols={7} /> : <CardListSkeleton rows={3} />} errorMessage={t("sessions.loadFailed")} isEmpty={(data) => data.items.length === 0} empty={<EmptyState icon={Monitor} title={t("sessions.empty")} description={t("sessions.emptyDescription")} />}>
      {(data) => admin ? <Surface className="overflow-hidden"><Table className="min-w-[1100px]">
        <caption className="sr-only">{t("sessions.adminTitle")}</caption>
        <TableHeader><TableRow>{["user", "deviceLabel", "created", "lastActivity", "expires", "statusLabel"].map((key) => <TableHead key={key}>{t(`sessions.${key}`)}</TableHead>)}{canRevoke && <TableHead className="text-end">{t("common.actions")}</TableHead>}</TableRow></TableHeader>
        <TableBody>{data.items.map((item) => <TableRow key={item.id}>
          <TableCell>{"user" in item && <div className="max-w-52"><button type="button" className="text-start font-medium text-primary hover:underline" aria-label={t("sessions.filterUser", { name: item.user.name })} onClick={() => { setOwner({ id: item.user.id, name: item.user.name }); setPage(1); }}>{item.user.name}</button><p className="truncate text-xs text-muted-foreground" dir="ltr">{item.user.email}</p></div>}</TableCell>
          <TableCell><SessionDevice session={item} /></TableCell><TableCell className="whitespace-nowrap text-xs">{date(item.createdAt)}</TableCell><TableCell className="whitespace-nowrap text-xs">{date(item.lastActivityAt)}</TableCell>
          <TableCell className="whitespace-nowrap text-xs"><div>{date(item.expiresAt)}</div><div className="mt-1 text-muted-foreground">{t("sessions.absoluteExpires")}: {date(item.absoluteExpiresAt)}</div></TableCell>
          <TableCell><SessionStatus session={item} /></TableCell>{canRevoke && <TableCell className="text-end">{revokeButton(item)}</TableCell>}
        </TableRow>)}</TableBody>
      </Table></Surface> : <div className="space-y-4">{data.items.map((item) => <Surface key={item.id} className="space-y-5 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3"><SessionDevice session={item} /><SessionStatus session={item} /></div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Fact label={t("sessions.created")} value={date(item.createdAt)} /><Fact label={t("sessions.lastActivity")} value={date(item.lastActivityAt)} /><Fact label={t("sessions.expires")} value={date(item.expiresAt)} /><Fact label={t("sessions.absoluteExpires")} value={date(item.absoluteExpiresAt)} /></div>
        {item.isLegacy && <p className="text-xs leading-5 text-muted-foreground">{t("sessions.legacyHint")}</p>}{revokeButton(item)}
      </Surface>)}</div>}
    </QueryPanel>
    {query.data && <PaginationBar page={query.data.page} pageSize={query.data.pageSize} total={query.data.total} onPageChange={setPage} />}
    <AlertDialog open={Boolean(pending)} onOpenChange={(open) => { if (!open && !mutation.isPending) setPending(null); }}><AlertDialogContent>
      <AlertDialogHeader><AlertDialogTitle>{t(`sessions.confirm${confirmationKey}Title`)}</AlertDialogTitle><AlertDialogDescription>{t(`sessions.confirm${confirmationKey}Description`)}</AlertDialogDescription></AlertDialogHeader>
      {mutation.isError && <p role="alert" className="text-sm text-destructive">{t("sessions.revokeFailed")}</p>}
      <AlertDialogFooter><AlertDialogCancel disabled={mutation.isPending}>{t("common.cancel")}</AlertDialogCancel>
        <AlertDialogAction className="gap-2 bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={mutation.isPending || !canRevoke} onClick={(event) => { event.preventDefault(); if (pending) mutation.mutate(pending); }}>{mutation.isPending && <LoaderCircle className="size-4 animate-spin" />}{t(mutation.isPending ? "sessions.revoking" : mutation.isError ? "common.retry" : "common.confirm")}</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent></AlertDialog>
  </PageFrame>;
}
