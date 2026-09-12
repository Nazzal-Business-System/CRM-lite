"use client";

import {
  type HypothesisRecord,
  type PaginatedResult,
  type ResearchEvidenceRecord,
} from "@nbs/shared";
import { useQuery } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  CardListSkeleton,
  DataToolbar,
  PageFrame,
  PageHeader,
  QueryPanel,
  Surface,
  ToolbarFilter,
  ToolbarSearch,
} from "@/components/crm/primitives";
import { EnumSelect } from "@/components/crm/selects";
import { useI18n } from "@/i18n/provider";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { navigateTo } from "@/lib/navigate";
import { toQuery, useDebouncedValue } from "@/lib/query";
import { sortParams, type SortSelection } from "@/lib/sorting";

export function ResearchWorkspace() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortSelection>("createdAt:desc");
  const debounced = useDebouncedValue(search);
  const query = useQuery({
    queryKey: ["research", debounced, sort],
    queryFn: () =>
      api.get<{
        evidence: PaginatedResult<ResearchEvidenceRecord>;
        hypotheses: PaginatedResult<HypothesisRecord>;
      }>(`/research${toQuery({ search: debounced, ...sortParams(sort), pageSize: 12 })}`),
  });

  return (
    <PageFrame width="wide">
      <PageHeader
        title={t("research.title")}
        description={t("research.description")}
      />
      <DataToolbar>
        <ToolbarSearch
          value={search}
          onChange={setSearch}
          placeholder={t("research.search")}
        />
        <ToolbarFilter className="sm:min-w-60" label={t("filters.sort")}>
          <EnumSelect
            value={sort}
            onChange={(value) => setSort(value as SortSelection)}
            options={[
              { value: "createdAt:desc", label: t("sort.recentlyAdded") },
              { value: "createdAt:asc", label: t("sort.oldestAdded") },
              { value: "updatedAt:desc", label: t("sort.recentlyUpdated") },
              { value: "updatedAt:asc", label: t("sort.oldestUpdated") },
              { value: "companyName:asc", label: t("sort.companyAsc") },
              { value: "companyName:desc", label: t("sort.companyDesc") },
            ]}
          />
        </ToolbarFilter>
      </DataToolbar>
      <QueryPanel
        query={query}
        skeleton={
          <div className="grid gap-4 lg:grid-cols-2">
            <CardListSkeleton rows={4} />
            <CardListSkeleton rows={4} />
          </div>
        }
        errorMessage={t("research.loadFailed")}
      >
        {(data) => (
          <div className="grid gap-4 lg:grid-cols-2">
            <Surface className="p-5">
              <h3 className="text-base font-semibold">{t("research.publicEvidence")}</h3>
              <div className="mt-4 space-y-2">
                {data.evidence.items.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("research.noEvidence")}</p>
                ) : (
                  data.evidence.items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="w-full cursor-pointer rounded-lg bg-muted/40 px-3 py-3 text-left hover:bg-muted/70"
                      onClick={() => navigateTo(router, `/companies/${item.companyId}`, pathname)}
                    >
                      <p className="text-[13px] text-muted-foreground">{item.companyName}</p>
                      <p className="font-medium">{item.title}</p>
                      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{item.details}</p>
                      <p className="mt-2 text-[13px] text-muted-foreground">
                        {formatDate(item.createdAt, locale)}
                      </p>
                    </button>
                  ))
                )}
              </div>
            </Surface>
            <Surface className="p-5">
              <h3 className="text-base font-semibold">{t("research.hypotheses")}</h3>
              <div className="mt-4 space-y-2">
                {data.hypotheses.items.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("research.noHypotheses")}</p>
                ) : (
                  data.hypotheses.items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="w-full cursor-pointer rounded-lg bg-muted/40 px-3 py-3 text-left hover:bg-muted/70"
                      onClick={() => navigateTo(router, `/companies/${item.companyId}`, pathname)}
                    >
                      <p className="text-[13px] text-muted-foreground">{item.companyName}</p>
                      <p className="text-sm">{item.statement}</p>
                      <p className="mt-2 text-[13px] text-muted-foreground">
                        {t(`enums.hypothesisStatus.${item.status}`)}
                      </p>
                    </button>
                  ))
                )}
              </div>
            </Surface>
          </div>
        )}
      </QueryPanel>
    </PageFrame>
  );
}
