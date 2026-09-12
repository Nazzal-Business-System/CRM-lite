"use client";

import {
  PERMISSION_KEYS,
  type ActivityRecord,
  type PaginatedResult,
} from "@nbs/shared";
import { useQuery } from "@tanstack/react-query";
import { NotebookPen, Plus } from "lucide-react";
import { useState } from "react";
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
import { useI18n } from "@/i18n/provider";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { toQuery, useDebouncedValue } from "@/lib/query";
import { sortParams, type SortSelection } from "@/lib/sorting";

export function ActivitiesWorkspace() {
  const { t, locale } = useI18n();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<SortSelection>("occurredAt:desc");
  const [open, setOpen] = useState(false);
  const debounced = useDebouncedValue(search);
  const query = useQuery({
    queryKey: ["activities", debounced, sort, page],
    queryFn: () =>
      api.get<PaginatedResult<ActivityRecord>>(
        `/activities${toQuery({ search: debounced, ...sortParams(sort), page, pageSize: 20 })}`,
      ),
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
                    <span className="text-[13px] text-muted-foreground">
                      {formatDateTime(activity.occurredAt, locale)}
                    </span>
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
    </PageFrame>
  );
}
