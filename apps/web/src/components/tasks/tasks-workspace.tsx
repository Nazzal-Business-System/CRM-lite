"use client";

import {
  PERMISSION_KEYS,
  type PaginatedResult,
  type TaskRecord,
} from "@nbs/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ListTodo, Plus, Pencil, Trash2, RotateCcw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
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
import { TaskFormDialog } from "@/components/tasks/task-form-dialog";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useI18n } from "@/i18n/provider";
import { api, ApiError } from "@/lib/api";
import { formatDateTime, jordanDateKey } from "@/lib/format";
import { toQuery, useDebouncedValue } from "@/lib/query";
import { sortParams, type SortSelection } from "@/lib/sorting";
import { cn } from "@/lib/utils";

function dueClass(task: TaskRecord): string {
  if (task.status !== "OPEN") {
    return "text-muted-foreground";
  }
  const due = jordanDateKey(task.dueAt);
  const today = jordanDateKey(new Date());
  if (due && today && due < today) {
    return "text-destructive font-medium";
  }
  if (due === today) {
    return "text-warning font-medium";
  }
  return "text-muted-foreground";
}

export function TasksWorkspace() {
  const { t, locale } = useI18n();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState("all");
  const [due, setDue] = useState("");
  const [sort, setSort] = useState<SortSelection>("dueAt:asc");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TaskRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TaskRecord | null>(null);
  const debounced = useDebouncedValue(search);

  const query = useQuery({
    queryKey: ["tasks", debounced, scope, due, sort, page],
    queryFn: () =>
      api.get<PaginatedResult<TaskRecord>>(
        `/tasks${toQuery({
          search: debounced,
          scope,
          due,
          ...sortParams(sort),
          page,
          pageSize: 20,
        })}`,
      ),
  });

  const completeMutation = useMutation({
    mutationFn: ({ id, reopen }: { id: string; reopen?: boolean }) => reopen
      ? api.patch(`/tasks/${id}`, { status: "OPEN" })
      : api.post(`/tasks/${id}/complete`),
    onSuccess: async (_data, variables) => {
      toast.success(t(variables.reopen ? "toasts.followUpReopened" : "toasts.followUpCompleted"));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["tasks"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["opportunities"] }),
        queryClient.invalidateQueries({ queryKey: ["companies"] }),
      ]);
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : t("tasks.saveFailed")),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/tasks/${id}`),
    onSuccess: async (_result, id) => {
      queryClient.setQueriesData<PaginatedResult<TaskRecord>>({ queryKey: ["tasks"] }, (data) => data ? {
        ...data,
        items: data.items.filter((item) => item.id !== id),
        total: data.items.some((item) => item.id === id) ? Math.max(0, data.total - 1) : data.total,
      } : data);
      setDeleteTarget(null);
      toast.success(t("toasts.followUpDeleted"));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["tasks"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["companies"] }),
        queryClient.invalidateQueries({ queryKey: ["opportunities"] }),
      ]);
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : t("tasks.deleteFailed")),
  });

  return (
    <PageFrame width="wide">
      <PageHeader
        title={t("tasks.title")}
        description={t("tasks.description")}
        count={query.data?.total}
        actions={
          <Can permission={PERMISSION_KEYS.TASKS_CREATE}>
            <Button onClick={() => setOpen(true)}>
              <Plus className="size-4" />
              {t("tasks.add")}
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
          placeholder={t("tasks.search")}
        />
        <ToolbarFilter className="sm:min-w-44" label={t("tasks.scope")}>
          <EnumSelect
            value={scope}
            onChange={(value) => {
              setScope(value || "all");
              setPage(1);
            }}
            options={[
              { value: "all", label: t("tasks.allTasks") },
              { value: "mine", label: t("tasks.myTasks") },
            ]}
          />
        </ToolbarFilter>
        <ToolbarFilter className="sm:min-w-60" label={t("filters.sort")}>
          <EnumSelect
            value={sort}
            onChange={(value) => { setSort(value as SortSelection); setPage(1); }}
            options={[
              { value: "dueAt:asc", label: t("sort.dueAsc") },
              { value: "dueAt:desc", label: t("sort.dueDesc") },
              { value: "createdAt:desc", label: t("sort.recentlyAdded") },
              { value: "updatedAt:desc", label: t("sort.recentlyUpdated") },
              { value: "status:asc", label: t("sort.statusAsc") },
              { value: "status:desc", label: t("sort.statusDesc") },
            ]}
          />
        </ToolbarFilter>
        <ToolbarFilter className="sm:min-w-44" label={t("tasks.due")}>
          <EnumSelect
            allowEmpty
            value={due}
            onChange={(value) => {
              setDue(value);
              setPage(1);
            }}
            options={[
              { value: "overdue", label: t("tasks.overdue") },
              { value: "today", label: t("tasks.dueToday") },
              { value: "upcoming", label: t("tasks.upcoming") },
              { value: "completed", label: t("tasks.completed") },
            ]}
            emptyLabel={t("filters.anyDue")}
            placeholder={t("filters.anyDue")}
          />
        </ToolbarFilter>
      </DataToolbar>
      <QueryPanel
        query={query}
        skeleton={<CardListSkeleton />}
        errorMessage={t("tasks.loadFailed")}
        isEmpty={(data) => data.items.length === 0}
        empty={
          <EmptyState
            icon={ListTodo}
            title={t("tasks.empty")}
            description={t("tasks.emptyHint")}
          />
        }
      >
        {(data) => (
          <>
            <div className="space-y-2">
              {data.items.map((task) => (
                <div
                  key={task.id}
                  className="flex items-start justify-between gap-3 rounded-xl border border-border/80 bg-card px-4 py-3.5"
                >
                  <div className="min-w-0 flex-1 text-start">
                    <p className="font-medium">{task.title}</p>
                    <p className={cn("text-sm", dueClass(task))}>
                      {task.status === "OPEN"
                        ? t("tasks.due")
                        : t(`enums.taskStatus.${task.status}`)}{" "}
                      {formatDateTime(task.dueAt, locale)}
                      {task.companyName ? ` · ${task.companyName}` : ""} · {task.owner.name}
                    </p>
                  </div>
                  <Can permission={PERMISSION_KEYS.TASKS_UPDATE}>
                    <Button size="icon" variant="ghost" className="size-9" aria-label={t("tasks.edit")} onClick={() => setEditing(task)}>
                      <Pencil className="size-4" />
                    </Button>
                  </Can>
                  <Can permission={PERMISSION_KEYS.TASKS_DELETE}>
                    <Button size="icon" variant="ghost" className="size-9 text-destructive" aria-label={t("tasks.delete")} onClick={() => setDeleteTarget(task)}>
                      <Trash2 className="size-4" />
                    </Button>
                  </Can>
                  {task.status === "OPEN" || task.status === "COMPLETED" ? (
                    <Can permission={PERMISSION_KEYS.TASKS_UPDATE}>
                      <Button
                        size="icon"
                        variant="outline"
                        className="size-9"
                        aria-label={task.status === "OPEN" ? t("tasks.complete") : t("tasks.reopen")}
                        loading={completeMutation.isPending && completeMutation.variables?.id === task.id}
                        onClick={() => completeMutation.mutate({ id: task.id, reopen: task.status === "COMPLETED" })}
                      >
                        {task.status === "OPEN" ? <Check className="size-4" /> : <RotateCcw className="size-4" />}
                      </Button>
                    </Can>
                  ) : null}
                </div>
              ))}
            </div>
            <PaginationBar
              page={page}
              pageSize={20}
              total={data.total}
              onPageChange={setPage}
            />
          </>
        )}
      </QueryPanel>
      <TaskFormDialog open={open} onOpenChange={setOpen} />
      <TaskFormDialog
        key={editing?.id ?? "edit"}
        open={Boolean(editing)}
        onOpenChange={(next) => {
          if (!next) {
            setEditing(null);
          }
        }}
        task={editing}
      />
      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(next) => { if (!next && !deleteMutation.isPending) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("tasks.deleteTitle", { name: deleteTarget?.title ?? "" })}</AlertDialogTitle>
            <AlertDialogDescription>{t("tasks.deleteBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction disabled={deleteMutation.isPending} onClick={(event) => { event.preventDefault(); if (deleteTarget) deleteMutation.mutate(deleteTarget.id); }}>
              {deleteMutation.isPending ? t("common.saving") : t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageFrame>
  );
}
