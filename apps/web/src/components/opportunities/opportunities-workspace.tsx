"use client";

import {
  OPPORTUNITY_STAGES,
  PERMISSION_KEYS,
  type ActivityRecord,
  type OpportunityDetail,
  type OpportunityStage,
  type OpportunitySummary,
  type PaginatedResult,
  type TaskRecord,
} from "@nbs/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Handshake, LayoutGrid, List, Plus } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { ActivityFormDialog } from "@/components/activities/activity-form-dialog";
import {
  CardListSkeleton,
  DataToolbar,
  DetailSkeleton,
  EmptyState,
  Fact,
  PageFrame,
  PageHeader,
  PaginationBar,
  QueryPanel,
  Surface,
  ToolbarFilter,
  ToolbarSearch,
} from "@/components/crm/primitives";
import { EnumSelect, UserSelect } from "@/components/crm/selects";
import { OpportunityFormDialog } from "@/components/opportunities/opportunity-form-dialog";
import { Can } from "@/components/permission-gate";
import { TaskFormDialog } from "@/components/tasks/task-form-dialog";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/provider";
import { api, ApiError } from "@/lib/api";
import { formatDateTime, formatMoney } from "@/lib/format";
import { navigateTo } from "@/lib/navigate";
import { toQuery, useDebouncedValue } from "@/lib/query";

const useOpportunityView = create<{
  view: "board" | "list";
  setView: (view: "board" | "list") => void;
}>()(
  persist(
    (set) => ({
      view: "board",
      setView: (view) => set({ view }),
    }),
    { name: "nbs-opportunity-view" },
  ),
);

export function OpportunitiesWorkspace() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const view = useOpportunityView((state) => state.view);
  const setView = useOpportunityView((state) => state.setView);
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState("");
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const debounced = useDebouncedValue(search);
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["opportunities", view, debounced, stage, ownerId, page],
    queryFn: () =>
      api.get<PaginatedResult<OpportunitySummary>>(
        `/opportunities${toQuery({
          search: debounced,
          stage,
          ownerId,
          page,
          pageSize: 20,
          view,
        })}`,
      ),
  });

  const stageMutation = useMutation({
    mutationFn: (input: { id: string; stage: OpportunityStage; lostReason?: string }) =>
      api.patch(`/opportunities/${input.id}`, {
        stage: input.stage,
        lostReason: input.lostReason,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["opportunities"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (error) => {
      toast.error(
        error instanceof ApiError ? error.message : t("opportunities.stageUpdateFailed"),
      );
    },
  });

  return (
    <PageFrame width="full">
      <PageHeader
        title={t("opportunities.title")}
        description={t("opportunities.description")}
        count={query.data?.total}
        actions={
          <>
            <div className="flex rounded-lg bg-muted p-1">
              <Button
                size="sm"
                variant={view === "board" ? "secondary" : "ghost"}
                onClick={() => setView("board")}
              >
                <LayoutGrid className="size-4" />
                {t("opportunities.board")}
              </Button>
              <Button
                size="sm"
                variant={view === "list" ? "secondary" : "ghost"}
                onClick={() => setView("list")}
              >
                <List className="size-4" />
                {t("opportunities.list")}
              </Button>
            </div>
            <Can permission={PERMISSION_KEYS.OPPORTUNITIES_CREATE}>
              <Button onClick={() => setOpen(true)}>
                <Plus className="size-4" />
                {t("opportunities.add")}
              </Button>
            </Can>
          </>
        }
      />
      <DataToolbar>
        <ToolbarSearch
          value={search}
          onChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
          placeholder={t("opportunities.search")}
        />
        <ToolbarFilter className="sm:min-w-48" label={t("opportunities.stage")}>
          <EnumSelect
            allowEmpty
            value={stage}
            onChange={(value) => {
              setStage(value);
              setPage(1);
            }}
            options={OPPORTUNITY_STAGES.map((value) => ({
              value,
              label: t(`enums.opportunityStage.${value}`),
            }))}
            emptyLabel={t("filters.anyStage")}
            placeholder={t("filters.anyStage")}
          />
        </ToolbarFilter>
        <ToolbarFilter className="sm:min-w-48" label={t("opportunities.owner")}>
          <UserSelect
            allowEmpty
            value={ownerId}
            onChange={setOwnerId}
            emptyLabel={t("common.allOwners")}
          />
        </ToolbarFilter>
      </DataToolbar>
      <QueryPanel
        query={query}
        skeleton={<CardListSkeleton rows={6} />}
        errorMessage={t("opportunities.loadFailed")}
        isEmpty={(data) => data.items.length === 0}
        empty={
          <EmptyState
            icon={Handshake}
            title={t("opportunities.empty")}
            description={t("opportunities.emptyHint")}
          />
        }
      >
        {(data) =>
          view === "board" ? (
            <div className="flex gap-3 overflow-x-auto pb-4">
              {OPPORTUNITY_STAGES.map((column) => {
                const cards = data.items.filter((item) => item.stage === column);
                return (
                  <section
                    key={column}
                    className="w-[17.5rem] shrink-0"
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      const id = event.dataTransfer.getData("text/plain");
                      if (!id) {
                        return;
                      }
                      if (column === "LOST") {
                        const reason = window.prompt(t("opportunities.lostReasonPrompt"));
                        if (!reason) {
                          return;
                        }
                        stageMutation.mutate({ id, stage: column, lostReason: reason });
                        return;
                      }
                      stageMutation.mutate({ id, stage: column });
                    }}
                  >
                    <div className="mb-2 flex items-baseline justify-between px-1">
                      <h3 className="text-sm font-medium">
                        {t(`enums.opportunityStage.${column}`)}
                      </h3>
                      <span className="text-[13px] tabular-nums text-muted-foreground">
                        {cards.length}
                      </span>
                    </div>
                    <div className="min-h-40 space-y-2 rounded-xl bg-muted/45 p-2">
                      {cards.map((item) => (
                        <article
                          key={item.id}
                          draggable
                          onDragStart={(event) => event.dataTransfer.setData("text/plain", item.id)}
                          className="cursor-pointer rounded-lg bg-card px-3 py-2.5 shadow-[0_1px_1px_oklch(0.2_0.03_255_/_0.05)] ring-1 ring-border/60"
                          onClick={() => navigateTo(router, `/opportunities/${item.id}`, pathname)}
                        >
                          <p className="text-[13px] text-muted-foreground">{item.companyName}</p>
                          <p className="mt-0.5 text-sm font-medium leading-5">{item.name}</p>
                          <p className="mt-2 text-[13px] text-muted-foreground">
                            {formatMoney(item.estimatedValue, locale)} ·{" "}
                            {item.owner?.name ?? t("common.unassigned")}
                          </p>
                        </article>
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          ) : (
            <>
              <div className="space-y-2">
                {data.items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="flex w-full cursor-pointer items-center justify-between rounded-xl border border-border/80 bg-card px-4 py-3.5 text-left"
                    onClick={() => navigateTo(router, `/opportunities/${item.id}`, pathname)}
                  >
                    <div className="min-w-0">
                      <p className="font-medium">{item.name}</p>
                      <p className="truncate text-sm text-muted-foreground">
                        {item.companyName} · {t(`enums.opportunityStage.${item.stage}`)}
                      </p>
                    </div>
                    <div className="text-right text-sm">
                      <p className="tabular-nums">{formatMoney(item.estimatedValue, locale)}</p>
                      <p className="text-muted-foreground">{item.probability}%</p>
                    </div>
                  </button>
                ))}
              </div>
              <PaginationBar
                page={page}
                pageSize={20}
                total={data.total}
                onPageChange={setPage}
              />
            </>
          )
        }
      </QueryPanel>
      <OpportunityFormDialog open={open} onOpenChange={setOpen} />
    </PageFrame>
  );
}

export function OpportunityDetailView({ id }: { id: string }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const query = useQuery({
    queryKey: ["opportunity", id],
    queryFn: () => api.get<{ opportunity: OpportunityDetail }>(`/opportunities/${id}`),
  });
  const activitiesQuery = useQuery({
    queryKey: ["activities", { opportunityId: id }],
    queryFn: () =>
      api.get<PaginatedResult<ActivityRecord>>(
        `/activities${toQuery({ opportunityId: id, pageSize: 10 })}`,
      ),
  });
  const tasksQuery = useQuery({
    queryKey: ["tasks", { opportunityId: id }],
    queryFn: () =>
      api.get<PaginatedResult<TaskRecord>>(
        `/tasks${toQuery({ opportunityId: id, pageSize: 10, status: "OPEN" })}`,
      ),
  });

  return (
    <PageFrame>
      <QueryPanel
        query={query}
        skeleton={<DetailSkeleton />}
        errorMessage={t("opportunities.detailLoadFailed")}
      >
        {(data) => {
          const opportunity = data.opportunity;
          return (
            <div className="space-y-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="text-[13px] text-muted-foreground">
                    {t(`enums.opportunityStage.${opportunity.stage}`)}
                  </p>
                  <h2 className="mt-1 text-[1.65rem] font-semibold tracking-[-0.03em]">
                    {opportunity.name}
                  </h2>
                  <button
                    type="button"
                    className="mt-1 cursor-pointer text-sm text-primary"
                    onClick={() =>
                      navigateTo(router, `/companies/${opportunity.companyId}`, pathname)
                    }
                  >
                    {opportunity.companyName}
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Can permission={PERMISSION_KEYS.ACTIVITIES_CREATE}>
                    <Button variant="outline" onClick={() => setActivityOpen(true)}>
                      {t("opportunities.logActivity")}
                    </Button>
                  </Can>
                  <Can permission={PERMISSION_KEYS.OPPORTUNITIES_UPDATE}>
                    <Button onClick={() => setOpen(true)}>{t("common.edit")}</Button>
                  </Can>
                </div>
              </div>
              <Surface className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
                <Fact
                  label={t("opportunities.value")}
                  value={formatMoney(opportunity.estimatedValue, locale)}
                />
                <Fact
                  label={t("opportunities.probability")}
                  value={`${opportunity.probability}%`}
                />
                <Fact
                  label={t("opportunities.weighted")}
                  value={formatMoney(opportunity.weightedValue, locale)}
                />
                <Fact
                  label={t("opportunities.owner")}
                  value={opportunity.owner?.name ?? t("common.unassigned")}
                />
              </Surface>
              <div className="grid gap-4 lg:grid-cols-2">
                <Surface className="p-5">
                  <h3 className="text-sm font-medium">{t("opportunities.confirmedProblem")}</h3>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">
                    {opportunity.confirmedProblem || t("opportunities.noConfirmedProblem")}
                  </p>
                </Surface>
                <Surface className="p-5">
                  <h3 className="text-sm font-medium">{t("opportunities.businessImpact")}</h3>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">
                    {opportunity.businessImpact || t("opportunities.noBusinessImpact")}
                  </p>
                </Surface>
                <Surface className="p-5 lg:col-span-2">
                  <h3 className="text-sm font-medium">{t("opportunities.proposedSolution")}</h3>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">
                    {opportunity.proposedSolution || t("opportunities.noProposedSolution")}
                  </p>
                </Surface>
              </div>
              {opportunity.lostReason ? (
                <p className="text-sm text-muted-foreground">
                  {t("opportunities.lostLabel", { reason: opportunity.lostReason })}
                </p>
              ) : null}
              <div className="grid gap-4 lg:grid-cols-2">
                <Surface className="p-5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium">{t("opportunities.activities")}</h3>
                    <Can permission={PERMISSION_KEYS.ACTIVITIES_CREATE}>
                      <Button size="sm" variant="outline" onClick={() => setActivityOpen(true)}>
                        {t("common.log")}
                      </Button>
                    </Can>
                  </div>
                  <div className="mt-4 space-y-3">
                    {(activitiesQuery.data?.items ?? []).length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        {t("opportunities.noActivities")}
                      </p>
                    ) : (
                      activitiesQuery.data?.items.map((activity) => (
                        <div key={activity.id} className="text-sm">
                          <p className="font-medium">
                            {t(`enums.activityType.${activity.type}`)} ·{" "}
                            {formatDateTime(activity.occurredAt, locale)}
                          </p>
                          <p className="text-muted-foreground">{activity.summary}</p>
                        </div>
                      ))
                    )}
                  </div>
                </Surface>
                <Surface className="p-5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium">{t("opportunities.followUps")}</h3>
                    <Can permission={PERMISSION_KEYS.TASKS_CREATE}>
                      <Button size="sm" variant="outline" onClick={() => setTaskOpen(true)}>
                        {t("common.add")}
                      </Button>
                    </Can>
                  </div>
                  <div className="mt-4 space-y-3">
                    {(tasksQuery.data?.items ?? []).length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        {t("opportunities.noFollowUps")}
                      </p>
                    ) : (
                      tasksQuery.data?.items.map((task) => (
                        <div key={task.id} className="text-sm">
                          <p className="font-medium">{task.title}</p>
                          <p className="text-muted-foreground">
                            {formatDateTime(task.dueAt, locale)}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </Surface>
              </div>
              <OpportunityFormDialog open={open} onOpenChange={setOpen} opportunity={opportunity} />
              <ActivityFormDialog
                open={activityOpen}
                onOpenChange={setActivityOpen}
                companyId={opportunity.companyId}
                opportunityId={opportunity.id}
              />
              <TaskFormDialog
                open={taskOpen}
                onOpenChange={setTaskOpen}
                companyId={opportunity.companyId}
                opportunityId={opportunity.id}
              />
            </div>
          );
        }}
      </QueryPanel>
    </PageFrame>
  );
}
