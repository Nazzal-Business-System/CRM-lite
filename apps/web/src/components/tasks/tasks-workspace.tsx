"use client";

import {
  PERMISSION_KEYS,
  type PaginatedResult,
  type TaskRecord,
} from "@nbs/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ListTodo, Plus } from "lucide-react";
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
import { useI18n } from "@/i18n/provider";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { toQuery, useDebouncedValue } from "@/lib/query";
import { cn } from "@/lib/utils";

function dueClass(task: TaskRecord): string {
  if (task.status !== "OPEN") {
    return "text-muted-foreground";
  }
  const due = new Date(task.dueAt);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  if (due < today) {
    return "text-destructive font-medium";
  }
  if (due.getTime() === today.getTime()) {
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
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TaskRecord | null>(null);
  const debounced = useDebouncedValue(search);

  const query = useQuery({
    queryKey: ["tasks", debounced, scope, due, page],
    queryFn: () =>
      api.get<PaginatedResult<TaskRecord>>(
        `/tasks${toQuery({
          search: debounced,
          scope,
          due,
          page,
          pageSize: 20,
        })}`,
      ),
  });

  const completeMutation = useMutation({
    mutationFn: (id: string) => api.post(`/tasks/${id}/complete`),
    onSuccess: async () => {
      toast.success(t("toasts.followUpCompleted"));
      await queryClient.invalidateQueries({ queryKey: ["tasks"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
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
                  <button
                    type="button"
                    className="min-w-0 flex-1 cursor-pointer text-left"
                    onClick={() => setEditing(task)}
                  >
                    <p className="font-medium">{task.title}</p>
                    <p className={cn("text-sm", dueClass(task))}>
                      {task.status === "OPEN"
                        ? t("tasks.due")
                        : t(`enums.taskStatus.${task.status}`)}{" "}
                      {formatDateTime(task.dueAt, locale)}
                      {task.companyName ? ` · ${task.companyName}` : ""} · {task.owner.name}
                    </p>
                  </button>
                  {task.status === "OPEN" ? (
                    <Can permission={PERMISSION_KEYS.TASKS_UPDATE}>
                      <Button
                        size="icon"
                        variant="outline"
                        className="size-9"
                        aria-label={t("tasks.complete")}
                        loading={completeMutation.isPending && completeMutation.variables === task.id}
                        onClick={() => completeMutation.mutate(task.id)}
                      >
                        <Check className="size-4" />
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
        open={Boolean(editing)}
        onOpenChange={(next) => {
          if (!next) {
            setEditing(null);
          }
        }}
        task={editing}
      />
    </PageFrame>
  );
}
