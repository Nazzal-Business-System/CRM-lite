"use client";

import {
  COMPANY_SIZES,
  COMPANY_SOURCES,
  PERMISSION_KEYS,
  QUALIFICATION_MAX,
  QUALIFICATION_MIN,
  type CompanyDetail,
  type CompanySummary,
  type PaginatedResult,
} from "@nbs/shared";
import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { Building2, LoaderCircle, Plus, Upload } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Can } from "@/components/permission-gate";
import { AppLink } from "@/components/layout/app-link";
import {
  CardListSkeleton,
  DataToolbar,
  EmptyState,
  PageFrame,
  PageHeader,
  PaginationBar,
  PriorityBadge,
  QualificationLabel,
  QueryPanel,
  Surface,
  TableSkeleton,
  ToolbarFilter,
  ToolbarSearch,
} from "@/components/crm/primitives";
import { EnumSelect, FormField, UserSelect } from "@/components/crm/selects";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useI18n } from "@/i18n/provider";
import { api, ApiError } from "@/lib/api";
import { formatDate, formatDateTime } from "@/lib/format";
import { navigateTo } from "@/lib/navigate";
import { toQuery, useDebouncedValue } from "@/lib/query";
import { sortParams, type SortSelection } from "@/lib/sorting";

const SCORE_OPTIONS = Array.from({ length: QUALIFICATION_MAX }, (_, index) => ({
  value: String(index + QUALIFICATION_MIN),
  label: String(index + QUALIFICATION_MIN),
}));

interface CompanyFormState {
  name: string;
  website: string;
  sector: string;
  companySize: string;
  locations: string;
  source: string;
  companyFit: string;
  problemPotential: string;
  decisionMakerAccess: string;
  ownerId: string | null;
  generalNotes: string;
}

const emptyForm: CompanyFormState = {
  name: "",
  website: "",
  sector: "",
  companySize: "UNKNOWN",
  locations: "",
  source: "RESEARCH",
  companyFit: "",
  problemPotential: "",
  decisionMakerAccess: "",
  ownerId: null,
  generalNotes: "",
};

function formFromCompany(company: CompanyDetail): CompanyFormState {
  return {
    name: company.name,
    website: company.website ?? "",
    sector: company.sector ?? "",
    companySize: company.companySize,
    locations: company.locations ?? "",
    source: company.source,
    companyFit: company.companyFit?.toString() ?? "",
    problemPotential: company.problemPotential?.toString() ?? "",
    decisionMakerAccess: company.decisionMakerAccess?.toString() ?? "",
    ownerId: company.owner?.id ?? null,
    generalNotes: company.generalNotes ?? "",
  };
}

function scoreValue(value: string): number | null {
  return value ? Number(value) : null;
}

export function CompanyFormDialog({
  open,
  onOpenChange,
  company,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  company?: CompanyDetail | null;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const [form, setForm] = useState<CompanyFormState>(
    company ? formFromCompany(company) : emptyForm,
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name,
        website: form.website,
        sector: form.sector,
        companySize: form.companySize,
        locations: form.locations,
        source: form.source,
        companyFit: scoreValue(form.companyFit),
        problemPotential: scoreValue(form.problemPotential),
        decisionMakerAccess: scoreValue(form.decisionMakerAccess),
        ownerId: form.ownerId,
        generalNotes: form.generalNotes,
      };
      if (company) {
        return api.patch<{ company: CompanyDetail }>(`/companies/${company.id}`, payload);
      }
      return api.post<{ company: CompanyDetail }>("/companies", payload);
    },
    onSuccess: async (data) => {
      toast.success(company ? t("toasts.companyUpdated") : t("toasts.companyCreated"));
      onOpenChange(false);
      setForm(emptyForm);
      await queryClient.invalidateQueries({ queryKey: ["companies"] });
      await queryClient.invalidateQueries({ queryKey: ["company", data.company.id] });
      if (!company) {
        navigateTo(router, `/companies/${data.company.id}`, pathname);
      }
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        setErrors(
          Object.fromEntries(
            Object.entries(error.fields ?? {}).map(([key, messages]) => [
              key,
              messages?.[0] ?? error.message,
            ]),
          ),
        );
        toast.error(error.message);
      }
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (next) {
          setForm(company ? formFromCompany(company) : emptyForm);
          setErrors({});
        }
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{company ? t("companies.edit") : t("companies.add")}</DialogTitle>
          <DialogDescription>{t("companies.formDescription")}</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate();
          }}
        >
          <div className="sm:col-span-2">
            <FormField
              label={t("companies.company")}
              htmlFor="company-name"
              required
              error={errors.name}
            >
              <Input
                id="company-name"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
            </FormField>
          </div>
          <FormField
            label={t("companies.website")}
            htmlFor="company-website"
            optional
            error={errors.website}
          >
            <Input
              id="company-website"
              dir="ltr"
              value={form.website}
              onChange={(event) => setForm({ ...form, website: event.target.value })}
            />
          </FormField>
          <FormField
            label={t("companies.sector")}
            htmlFor="company-sector"
            error={errors.sector}
          >
            <Input
              id="company-sector"
              value={form.sector}
              onChange={(event) => setForm({ ...form, sector: event.target.value })}
            />
          </FormField>
          <FormField label={t("companies.size")} error={errors.companySize}>
            <EnumSelect
              value={form.companySize}
              onChange={(value) => setForm({ ...form, companySize: value })}
              options={COMPANY_SIZES.map((value) => ({
                value,
                label: t(`enums.companySize.${value}`),
              }))}
            />
          </FormField>
          <FormField label={t("companies.source")} error={errors.source}>
            <EnumSelect
              value={form.source}
              onChange={(value) => setForm({ ...form, source: value })}
              options={COMPANY_SOURCES.map((value) => ({
                value,
                label: t(`enums.companySource.${value}`),
              }))}
            />
          </FormField>
          <div className="sm:col-span-2">
            <FormField
              label={t("companies.locations")}
              htmlFor="company-locations"
              error={errors.locations}
            >
              <Input
                id="company-locations"
                value={form.locations}
                onChange={(event) => setForm({ ...form, locations: event.target.value })}
              />
            </FormField>
          </div>
          <FormField label={t("companies.companyFit")} error={errors.companyFit}>
            <EnumSelect
              allowEmpty
              emptyLabel={t("common.dash")}
              value={form.companyFit}
              onChange={(value) => setForm({ ...form, companyFit: value })}
              options={SCORE_OPTIONS}
              placeholder={t("common.dash")}
            />
          </FormField>
          <FormField
            label={t("companies.problemPotential")}
            error={errors.problemPotential}
          >
            <EnumSelect
              allowEmpty
              emptyLabel={t("common.dash")}
              value={form.problemPotential}
              onChange={(value) => setForm({ ...form, problemPotential: value })}
              options={SCORE_OPTIONS}
              placeholder={t("common.dash")}
            />
          </FormField>
          <FormField
            label={t("companies.decisionMakerAccess")}
            error={errors.decisionMakerAccess}
          >
            <EnumSelect
              allowEmpty
              emptyLabel={t("common.dash")}
              value={form.decisionMakerAccess}
              onChange={(value) => setForm({ ...form, decisionMakerAccess: value })}
              options={SCORE_OPTIONS}
              placeholder={t("common.dash")}
            />
          </FormField>
          <FormField label={t("companies.owner")} error={errors.ownerId}>
            <UserSelect
              allowEmpty
              emptyLabel={t("common.unassigned")}
              value={form.ownerId}
              onChange={(value) => setForm({ ...form, ownerId: value })}
            />
          </FormField>
          <div className="sm:col-span-2">
            <FormField
              label={t("companies.notes")}
              htmlFor="company-notes"
              error={errors.generalNotes}
            >
              <Textarea
                id="company-notes"
                value={form.generalNotes}
                onChange={(event) => setForm({ ...form, generalNotes: event.target.value })}
              />
            </FormField>
          </div>
          <DialogFooter className="sm:col-span-2">
            <Button
              type="button"
              variant="outline"
              disabled={mutation.isPending}
              onClick={() => onOpenChange(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button type="submit" loading={mutation.isPending}>
              {mutation.isPending
                ? t("common.saving")
                : company
                  ? t("common.save")
                  : t("companies.create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CompaniesWorkspace() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [priority, setPriority] = useState("");
  const [sort, setSort] = useState<SortSelection>("updatedAt:desc");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<CompanyDetail | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CompanySummary | null>(null);
  const debouncedSearch = useDebouncedValue(search);

  const query = useQuery({
    queryKey: ["companies", debouncedSearch, priority, sort, page],
    queryFn: () =>
      api.get<PaginatedResult<CompanySummary>>(
        `/companies${toQuery({
          search: debouncedSearch,
          priority,
          page,
          pageSize: 20,
          ...sortParams(sort),
        })}`,
      ),
    placeholderData: keepPreviousData,
  });

  const deleteMutation = useMutation({
    mutationFn: () => {
      if (!deleteTarget) {
        throw new Error("No company selected");
      }
      return api.delete(`/companies/${deleteTarget.id}`);
    },
    onSuccess: async () => {
      toast.success(t("toasts.companyDeleted"));
      setDeleteTarget(null);
      await queryClient.invalidateQueries({ queryKey: ["companies"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : t("companies.deleteFailed"));
    },
  });

  async function openEdit(companyId: string) {
    try {
      const data = await api.get<{ company: CompanyDetail }>(`/companies/${companyId}`);
      setEditingCompany(data.company);
      setEditOpen(true);
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : t("companies.openEditFailed"),
      );
    }
  }

  return (
    <PageFrame width="wide">
      <PageHeader
        title={t("companies.title")}
        description={t("companies.description")}
        count={query.data?.total}
        actions={
          <>
            <Can permission={PERMISSION_KEYS.IMPORTS_CREATE}>
              <Button variant="outline" asChild>
                <AppLink href="/imports">
                  <Upload className="size-4" />
                  {t("companies.import")}
                </AppLink>
              </Button>
            </Can>
            <Can permission={PERMISSION_KEYS.COMPANIES_CREATE}>
              <Button onClick={() => setOpen(true)}>
                <Plus className="size-4" />
                {t("companies.add")}
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
          placeholder={t("companies.search")}
          loading={query.isFetching && !query.isPending}
        />
        <ToolbarFilter className="sm:w-52" label={t("companies.priority")}>
          <EnumSelect
            allowEmpty
            value={priority}
            onChange={(value) => {
              setPriority(value);
              setPage(1);
            }}
            options={[
              { value: "HIGH", label: t("enums.priority.HIGH") },
              { value: "MEDIUM", label: t("enums.priority.MEDIUM") },
              { value: "LOW", label: t("enums.priority.LOW") },
            ]}
            emptyLabel={t("filters.anyPriority")}
            placeholder={t("filters.anyPriority")}
          />
        </ToolbarFilter>
        <ToolbarFilter className="sm:min-w-64" label={t("filters.sort")}>
          <EnumSelect
            value={sort}
            onChange={(value) => {
              setSort(value as SortSelection);
              setPage(1);
            }}
            options={[
              { value: "updatedAt:desc", label: t("sort.recentlyUpdated") },
              { value: "updatedAt:asc", label: t("sort.oldestUpdated") },
              { value: "createdAt:desc", label: t("sort.recentlyAdded") },
              { value: "createdAt:asc", label: t("sort.oldestAdded") },
              { value: "name:asc", label: t("sort.nameAsc") },
              { value: "name:desc", label: t("sort.nameDesc") },
              { value: "priority:desc", label: t("sort.priorityDesc") },
              { value: "priority:asc", label: t("sort.priorityAsc") },
              { value: "qualificationScore:desc", label: t("sort.qualificationDesc") },
              { value: "qualificationScore:asc", label: t("sort.qualificationAsc") },
              { value: "companySize:desc", label: t("sort.sizeDesc") },
              { value: "companySize:asc", label: t("sort.sizeAsc") },
              { value: "nextFollowUpAt:asc", label: t("sort.followUpAsc") },
              { value: "nextFollowUpAt:desc", label: t("sort.followUpDesc") },
            ]}
          />
        </ToolbarFilter>
      </DataToolbar>
      <QueryPanel
        query={query}
        skeleton={
          <>
            <div className="hidden md:block">
              <TableSkeleton cols={9} />
            </div>
            <div className="md:hidden">
              <CardListSkeleton />
            </div>
          </>
        }
        errorMessage={t("companies.loadFailed")}
        isEmpty={(data) => data.items.length === 0}
        empty={
          <EmptyState
            icon={Building2}
            title={t("companies.empty")}
            description={t("companies.emptyHint")}
            actions={
              <Can permission={PERMISSION_KEYS.COMPANIES_CREATE}>
                <Button onClick={() => setOpen(true)}>{t("companies.add")}</Button>
              </Can>
            }
          />
        }
      >
        {(data) => (
          <>
            <Surface className="hidden md:block">
              <Table className="table-fixed w-full">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[20%]">{t("companies.company")}</TableHead>
                    <TableHead className="w-[12%]">{t("companies.sector")}</TableHead>
                    <TableHead className="w-[7%]">{t("companies.size")}</TableHead>
                    <TableHead className="w-[12%]">{t("companies.qualification")}</TableHead>
                    <TableHead className="w-[8%]">{t("companies.priority")}</TableHead>
                    <TableHead className="w-[11%]">{t("companies.owner")}</TableHead>
                    <TableHead className="w-[7%] text-center">
                      {t("companies.opportunities")}
                    </TableHead>
                    <TableHead className="w-[11%]">{t("companies.nextFollowUp")}</TableHead>
                    <TableHead className="w-[12%] text-end">
                      {t("companies.actions")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.map((company) => (
                    <TableRow
                      key={company.id}
                      className="cursor-pointer"
                      onClick={() => navigateTo(router, `/companies/${company.id}`, pathname)}
                    >
                      <TableCell>
                        <div className="min-w-0">
                          <div
                            className="truncate font-medium"
                            dir="auto"
                            title={company.name}
                          >
                            {company.name}
                          </div>
                          <div
                            className="truncate text-[13px] text-muted-foreground"
                            dir="ltr"
                            title={company.website || undefined}
                          >
                            {company.website || t("common.noWebsite")}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span
                          className="line-clamp-2 break-words"
                          dir="auto"
                          title={company.sector || undefined}
                        >
                          {company.sector || t("common.dash")}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span dir="ltr" className="tabular-nums">
                          {t(`enums.companySize.${company.companySize}`)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="line-clamp-2">
                          <QualificationLabel
                            score={company.qualificationScore}
                            accessPending={company.accessPending}
                          />
                        </div>
                      </TableCell>
                      <TableCell>
                        <PriorityBadge priority={company.priority} />
                      </TableCell>
                      <TableCell>
                        <span className="line-clamp-2 break-words" dir="auto">
                          {company.owner?.name ?? t("common.unassigned")}
                        </span>
                      </TableCell>
                      <TableCell className="text-center tabular-nums" dir="ltr">
                        {company.activeOpportunityCount > 0
                          ? company.activeOpportunityCount
                          : t("common.none")}
                      </TableCell>
                      <TableCell>
                        <span dir="ltr" className="block truncate tabular-nums">
                          {company.nextFollowUpAt
                            ? formatDate(company.nextFollowUpAt, locale)
                            : t("common.notScheduled")}
                        </span>
                      </TableCell>
                      <TableCell
                        className="text-end"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <Can permission={PERMISSION_KEYS.COMPANIES_UPDATE}>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="min-w-[4.25rem]"
                              onClick={() => void openEdit(company.id)}
                            >
                              {t("common.edit")}
                            </Button>
                          </Can>
                          <Can permission={PERMISSION_KEYS.COMPANIES_DELETE}>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="min-w-[4.25rem]"
                              onClick={() => setDeleteTarget(company)}
                            >
                              {t("common.delete")}
                            </Button>
                          </Can>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Surface>
            <div className="space-y-2 md:hidden">
              {data.items.map((company) => (
                <div
                  key={company.id}
                  className="rounded-xl border border-border/80 bg-card p-4"
                >
                  <button
                    type="button"
                    className="w-full cursor-pointer text-start"
                    onClick={() => navigateTo(router, `/companies/${company.id}`, pathname)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium" dir="auto">
                          {company.name}
                        </p>
                        <p className="text-sm text-muted-foreground" dir="auto">
                          {company.sector || t("common.noSector")}
                        </p>
                      </div>
                      <PriorityBadge priority={company.priority} />
                    </div>
                    <p className="mt-3 text-[13px] text-muted-foreground" dir="ltr">
                      {t("companies.nextFollowUpValue", {
                        date: company.nextFollowUpAt
                          ? formatDateTime(company.nextFollowUpAt, locale)
                          : t("common.notScheduled"),
                      })}
                    </p>
                  </button>
                  <div className="mt-3 flex justify-end gap-2 border-t border-border/60 pt-3">
                    <Can permission={PERMISSION_KEYS.COMPANIES_UPDATE}>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="w-[72px]"
                        onClick={() => void openEdit(company.id)}
                      >
                        {t("common.edit")}
                      </Button>
                    </Can>
                    <Can permission={PERMISSION_KEYS.COMPANIES_DELETE}>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="w-[72px]"
                        onClick={() => setDeleteTarget(company)}
                      >
                        {t("common.delete")}
                      </Button>
                    </Can>
                  </div>
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
      <CompanyFormDialog open={open} onOpenChange={setOpen} />
      <CompanyFormDialog
        key={editingCompany?.id ?? "edit-closed"}
        open={editOpen}
        onOpenChange={(next) => {
          setEditOpen(next);
          if (!next) {
            setEditingCompany(null);
          }
        }}
        company={editingCompany}
      />
      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(next) => {
          if (deleteMutation.isPending) {
            return;
          }
          if (!next) {
            setDeleteTarget(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("companies.deleteTitle", { name: deleteTarget?.name ?? "" })}
            </AlertDialogTitle>
            <AlertDialogDescription>{t("companies.deleteBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                deleteMutation.mutate();
              }}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? (
                <>
                  <LoaderCircle className="size-4 animate-spin" aria-hidden />
                  {t("common.deleting")}
                </>
              ) : (
                t("companies.delete")
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageFrame>
  );
}
