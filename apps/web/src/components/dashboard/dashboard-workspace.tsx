"use client";

import { type DashboardData } from "@nbs/shared";
import { useQuery } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import {
  DashboardSkeleton,
  PageFrame,
  PageHeader,
  PriorityBadge,
  QueryPanel,
  Surface,
} from "@/components/crm/primitives";
import { useI18n } from "@/i18n/provider";
import { api } from "@/lib/api";
import { formatDateTime, formatMoney } from "@/lib/format";
import { navigateTo } from "@/lib/navigate";
import { useAuth } from "@/providers/auth-provider";
import { cn } from "@/lib/utils";

function FollowUpRow({
  title,
  meta,
  tone,
  onClick,
}: {
  title: string;
  meta: string;
  tone: "overdue" | "today" | "neutral";
  onClick?: () => void;
}) {
  const { t } = useI18n();
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "flex w-full items-start justify-between gap-3 rounded-lg px-2 py-2 text-start",
        onClick && "cursor-pointer hover:bg-muted/60",
      )}
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{title}</p>
        <p className="truncate text-[13px] text-muted-foreground">{meta}</p>
      </div>
      <span
        className={cn(
          "shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium",
          tone === "overdue" && "bg-destructive/12 text-destructive",
          tone === "today" && "bg-warning/12 text-warning",
          tone === "neutral" && "bg-muted text-muted-foreground",
        )}
      >
        {tone === "overdue"
          ? t("dashboard.overdue")
          : tone === "today"
            ? t("common.today")
            : t("dashboard.open")}
      </span>
    </Comp>
  );
}

function PipelineChart({ dashboard }: { dashboard: DashboardData }) {
  const { t, locale } = useI18n();
  const max = Math.max(
    1,
    ...dashboard.pipelineByStage.map((row) => row.count),
  );

  return (
    <div className="space-y-3">
      {dashboard.pipelineByStage.map((row) => {
        const stageValue = Number(row.value) || 0;
        const width = Math.max(6, Math.round((row.count / max) * 100));
        return (
          <div key={row.stage} className="grid grid-cols-[minmax(0,6.5rem)_minmax(0,1fr)_auto] items-center gap-2 sm:grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)_auto] sm:gap-3">
            <span className="truncate text-[13px] text-muted-foreground">
              {t(`enums.opportunityStage.${row.stage}`)}
            </span>
            <div className="h-2 min-w-0 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary/80"
                style={{ width: `${width}%` }}
              />
            </div>
            <span className="min-w-0 max-w-[5.5rem] truncate text-end text-[13px] tabular-nums text-foreground sm:max-w-none sm:min-w-[4.5rem]">
              {row.count}
              {stageValue > 0 ? (
                <span className="ms-2 text-muted-foreground" dir="ltr">
                  {formatMoney(row.value, locale)}
                </span>
              ) : null}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function DashboardWorkspace() {
  const { t, locale } = useI18n();
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const query = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api.get<{ dashboard: DashboardData }>("/dashboard"),
    staleTime: 0,
  });

  const firstName = user?.name.split(" ")[0];

  return (
    <PageFrame className="min-w-0 max-w-full">
      <PageHeader
        title={
          firstName
            ? t("dashboard.titleNamed", { name: firstName })
            : t("dashboard.title")
        }
        description={t("dashboard.description")}
      />
      <QueryPanel
        query={query}
        skeleton={<DashboardSkeleton />}
        errorMessage={t("dashboard.loadFailed")}
      >
        {(data) => {
          const dashboard = data.dashboard;
          const followUps = [
            ...dashboard.overdueTasks.map((task) => ({ task, tone: "overdue" as const })),
            ...dashboard.dueTodayTasks.map((task) => ({ task, tone: "today" as const })),
          ];
          const recentActivities = dashboard.recentActivities ?? [];
          return (
            <div className="min-w-0 w-full space-y-6 overflow-x-hidden">
              <div className="grid min-w-0 gap-4 [&>*]:min-w-0 xl:grid-cols-[1.15fr_0.85fr]">
                <Surface className="p-5">
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="text-base font-semibold">{t("dashboard.followUps")}</h3>
                    <p className="text-sm tabular-nums text-muted-foreground">
                      {t("dashboard.overdueCount", {
                        count: dashboard.metrics.overdueFollowUps,
                      })}
                    </p>
                  </div>
                  <div className="mt-4 space-y-1">
                    {followUps.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        {t("dashboard.emptyFollowUps")}
                      </p>
                    ) : (
                      followUps.map(({ task, tone }) => (
                        <FollowUpRow
                          key={task.id}
                          title={task.title}
                          meta={`${formatDateTime(task.dueAt, locale)}${task.companyName ? ` · ${task.companyName}` : ""}`}
                          tone={tone}
                          onClick={
                            task.companyId
                              ? () => navigateTo(router, `/companies/${task.companyId}`, pathname)
                              : undefined
                          }
                        />
                      ))
                    )}
                  </div>
                </Surface>
                <Surface className="p-5">
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="text-base font-semibold">{t("dashboard.pipeline")}</h3>
                    <p className="text-sm tabular-nums text-muted-foreground">
                      {t("dashboard.liveValue", {
                        value: formatMoney(dashboard.metrics.pipelineValue, locale),
                      })}
                    </p>
                  </div>
                  <div className="mt-5">
                    <PipelineChart dashboard={dashboard} />
                  </div>
                  <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-border/70 pt-4">
                    <div>
                      <dt className="text-[13px] text-muted-foreground">
                        {t("dashboard.weighted")}
                      </dt>
                      <dd className="mt-1 text-sm font-medium tabular-nums">
                        {formatMoney(dashboard.metrics.weightedPipeline, locale)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[13px] text-muted-foreground">
                        {t("dashboard.qualifiedPlus")}
                      </dt>
                      <dd className="mt-1 text-sm font-medium tabular-nums">
                        {dashboard.metrics.qualifiedPlusOpportunities}
                      </dd>
                    </div>
                  </dl>
                </Surface>
              </div>

              <div className="grid min-w-0 gap-3 [&>*]:min-w-0 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-xl bg-card px-4 py-3 ring-1 ring-border/70">
                  <p className="text-[13px] text-muted-foreground">
                    {t("dashboard.activeOpportunities")}
                  </p>
                  <p className="mt-1 text-xl font-semibold tabular-nums">
                    {dashboard.metrics.activeOpportunities}
                  </p>
                </div>
                <div className="rounded-xl bg-card px-4 py-3 ring-1 ring-border/70">
                  <p className="text-[13px] text-muted-foreground">{t("dashboard.wonLost")}</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums">
                    {dashboard.metrics.wonCount}
                    <span className="mx-1.5 text-muted-foreground">/</span>
                    {dashboard.metrics.lostCount}
                  </p>
                </div>
                <div className="rounded-xl bg-card px-4 py-3 ring-1 ring-border/70">
                  <p className="text-[13px] text-muted-foreground">{t("dashboard.companies")}</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums">
                    {dashboard.metrics.totalCompanies}
                  </p>
                </div>
                <div className="rounded-xl bg-card px-4 py-3 ring-1 ring-border/70">
                  <p className="text-[13px] text-muted-foreground">
                    {t("dashboard.highPriority")}
                  </p>
                  <p className="mt-1 text-xl font-semibold tabular-nums">
                    {dashboard.metrics.highPriorityCompanies}
                  </p>
                </div>
              </div>

              <div className="grid min-w-0 gap-4 [&>*]:min-w-0 lg:grid-cols-2">
                <Surface className="p-5">
                  <h3 className="text-base font-semibold">
                    {t("dashboard.priorityCompanies")}
                  </h3>
                  <div className="mt-3 divide-y divide-border/60">
                    {dashboard.priorityCompanies.length === 0 ? (
                      <p className="py-3 text-sm text-muted-foreground">
                        {t("dashboard.emptyPriorityCompanies")}
                      </p>
                    ) : (
                      dashboard.priorityCompanies.map((company) => (
                        <button
                          key={company.id}
                          type="button"
                          className="flex w-full cursor-pointer items-center justify-between gap-3 py-3 text-start"
                          onClick={() => navigateTo(router, `/companies/${company.id}`, pathname)}
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium">{company.name}</span>
                            <span className="block truncate text-[13px] text-muted-foreground">
                              {company.sector || t("common.noSector")}
                            </span>
                          </span>
                          <PriorityBadge priority={company.priority} />
                        </button>
                      ))
                    )}
                  </div>
                </Surface>
                <Surface className="p-5">
                  <h3 className="text-base font-semibold">{t("dashboard.recentActivity")}</h3>
                  <div className="mt-3 divide-y divide-border/60">
                    {recentActivities.length === 0 ? (
                      <p className="py-3 text-sm text-muted-foreground">
                        {t("dashboard.emptyActivity")}
                      </p>
                    ) : (
                      recentActivities.map((activity) => (
                        <button
                          key={activity.id}
                          type="button"
                          className="flex w-full cursor-pointer flex-col gap-1.5 py-3 text-start"
                          onClick={() =>
                            navigateTo(router, `/companies/${activity.companyId}`, pathname)
                          }
                        >
                          <span className="flex items-center justify-between gap-2">
                            <span className="truncate text-sm font-medium">
                              {t(`enums.activityType.${activity.type}`)}
                            </span>
                            <span className="shrink-0 text-[12px] text-muted-foreground" dir="ltr">
                              {formatDateTime(activity.occurredAt, locale)}
                            </span>
                          </span>
                          <span className="truncate text-[13px] text-muted-foreground" dir="auto">
                            {activity.companyName}
                            {activity.contactName ? ` · ${activity.contactName}` : ""}
                          </span>
                          <span className="line-clamp-2 text-[13px]" dir="auto">
                            {activity.summary}
                          </span>
                          {activity.owner?.name ? (
                            <span className="truncate text-[12px] text-muted-foreground" dir="auto">
                              {activity.owner.name}
                            </span>
                          ) : null}
                        </button>
                      ))
                    )}
                  </div>
                </Surface>
              </div>
            </div>
          );
        }}
      </QueryPanel>
    </PageFrame>
  );
}
