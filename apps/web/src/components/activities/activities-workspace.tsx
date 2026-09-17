"use client";

import {
  PERMISSION_KEYS,
  type ActivityRecord,
  type PaginatedResult,
} from "@nbs/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { NotebookPen, Plus, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ActivityFormDialog } from "@/components/activities/activity-form-dialog";
import {
  CardListSkeleton,
  DataToolbar,
  EmptyState,
  PageFrame,
  PageHeader,
  PaginationBar,
  QueryPanel,
  ToolbarFilter,
  ToolbarSearch,
} from "@/components/crm/primitives";
import { EnumSelect } from "@/components/crm/selects";
import { Can } from "@/components/permission-gate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useI18n } from "@/i18n/provider";
import { api, ApiError } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { toQuery, useDebouncedValue } from "@/lib/query";
import { sortParams, type SortSelection } from "@/lib/sorting";

export function ActivitiesWorkspace() {
  const { t, locale } = useI18n();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<SortSelection>("occurredAt:desc");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ActivityRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ActivityRecord | null>(null);
  const queryClient = useQueryClient();
  const debounced = useDebouncedValue(search);
  const query = useQuery({
    queryKey: ["activities", debounced, sort, page],
    queryFn: () =>
      api.get<PaginatedResult<ActivityRecord>>(
        `/activities${toQuery({ search: debounced, ...sortParams(sort), page, pageSize: 20 })}`,
      ),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/activities/${id}`),
    onSuccess: async (_result, id) => {
      queryClient.setQueriesData<PaginatedResult<ActivityRecord>>({ queryKey: ["activities"] }, (data) => data ? {
        ...data,
        items: data.items.filter((item) => item.id !== id),
        total: data.items.some((item) => item.id === id) ? Math.max(0, data.total - 1) : data.total,
      } : data);
      setDeleteTarget(null);
      toast.success(t("toasts.activityDeleted"));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["activities"] }),
        queryClient.invalidateQueries({ queryKey: ["companies"] }),
        queryClient.invalidateQueries({ queryKey: ["opportunities"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
      ]);
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : t("activities.deleteFailed")),
  });

  return (
    <PageFrame width="wide">
      <PageHeader
        title={t("activities.title")}
        description={t("activities.description")}
        count={query.data?.total}
        actions={
          <Can permission={PERMISSION_KEYS.ACTIVITIES_CREATE}>
            <Button onClick={() => setOpen(true)}>
              <Plus className="size-4" />
              {t("activities.add")}
            </Button>
          </Can>
        }
      />
      <DataToolbar>
        <ToolbarSearch
          value={search}
          onChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
          placeholder={t("activities.search")}
        />
        <ToolbarFilter className="sm:min-w-60" label={t("filters.sort")}>
          <EnumSelect
            value={sort}
            onChange={(value) => { setSort(value as SortSelection); setPage(1); }}
            options={[
              { value: "occurredAt:desc", label: t("sort.activityDesc") },
              { value: "occurredAt:asc", label: t("sort.activityAsc") },
              { value: "createdAt:desc", label: t("sort.recentlyAdded") },
              { value: "updatedAt:desc", label: t("sort.recentlyUpdated") },
              { value: "type:asc", label: t("sort.typeAsc") },
              { value: "type:desc", label: t("sort.typeDesc") },
            ]}
          />
        </ToolbarFilter>
      </DataToolbar>
      <QueryPanel
        query={query}
        skeleton={<CardListSkeleton />}
        errorMessage={t("activities.loadFailed")}
        isEmpty={(data) => data.items.length === 0}
        empty={
          <EmptyState
            icon={NotebookPen}
            title={t("activities.empty")}
            description={t("activities.emptyHint")}
          />
        }
      >
        {(data) => (
          <>
            <ol className="space-y-2">
              {data.items.map((activity) => (
                <li
                  key={activity.id}
                  className="rounded-xl border border-border/80 bg-card px-4 py-3.5"
                >
                  <div className="flex items-center justify-between gap-3">
                    <Badge variant="secondary">
                      {t(`enums.activityType.${activity.type}`)}
                    </Badge>
                    <div className="flex items-center gap-1">
                      <span className="text-[13px] text-muted-foreground">{formatDateTime(activity.occurredAt, locale)}</span>
                      <Can permission={PERMISSION_KEYS.ACTIVITIES_UPDATE}>
                        <Button size="icon" variant="ghost" className="size-8" aria-label={t("activities.edit")} onClick={() => setEditing(activity)}><Pencil className="size-4" /></Button>
                      </Can>
                      <Can permission={PERMISSION_KEYS.ACTIVITIES_DELETE}>
                        <Button size="icon" variant="ghost" className="size-8 text-destructive" aria-label={t("activities.delete")} onClick={() => setDeleteTarget(activity)}><Trash2 className="size-4" /></Button>
                      </Can>
                    </div>
                  </div>
                  <p className="mt-2 text-sm font-medium">{activity.companyName}</p>
                  <p className="mt-1 text-sm leading-6">{activity.summary}</p>
                  {activity.outcome ? (
                    <p className="mt-1 text-sm text-muted-foreground">{activity.outcome}</p>
                  ) : null}
                  <p className="mt-2 text-[13px] text-muted-foreground">
                    {activity.contactName ? `${activity.contactName} · ` : ""}
                    {activity.owner.name}
                  </p>
                </li>
              ))}
            </ol>
            <PaginationBar
              page={page}
              pageSize={20}
              total={data.total}
              onPageChange={setPage}
            />
          </>
        )}
      </QueryPanel>
      <ActivityFormDialog open={open} onOpenChange={setOpen} />
      <ActivityFormDialog key={editing?.id ?? "edit"} activity={editing} open={Boolean(editing)} onOpenChange={(next) => { if (!next) setEditing(null); }} />
      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(next) => { if (!next && !deleteMutation.isPending) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("activities.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("activities.deleteBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction disabled={deleteMutation.isPending} onClick={(event) => { event.preventDefault(); if (deleteTarget) deleteMutation.mutate(deleteTarget.id); }}>{deleteMutation.isPending ? t("common.saving") : t("common.delete")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageFrame>
  );
}
