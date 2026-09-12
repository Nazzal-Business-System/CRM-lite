"use client";

import {
  PERMISSION_KEYS,
  RECRUITMENT_ROLE_TYPES,
  RECRUITMENT_STAGES,
  type PaginatedResult,
  type RecruitmentCandidateDetail,
  type RecruitmentCandidateSummary,
  type RecruitmentMetrics,
  type RecruitmentRoleType,
  type RecruitmentStage,
} from "@nbs/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2, UserRoundSearch } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Can } from "@/components/permission-gate";
import {
  DataToolbar,
  EmptyState,
  PageFrame,
  PageHeader,
  PaginationBar,
  QueryPanel,
  Surface,
  TableSkeleton,
  ToolbarFilter,
  ToolbarSearch,
} from "@/components/crm/primitives";
import { EnumSelect, FormField } from "@/components/crm/selects";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DateTimePicker } from "@/components/ui/date-time-picker";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useI18n } from "@/i18n/provider";
import { api, ApiError } from "@/lib/api";
import { formatDate, fromDateInput, toDateInput } from "@/lib/format";
import { toQuery, useDebouncedValue } from "@/lib/query";

type FormState = {
  fullName: string;
  email: string;
  phone: string;
  linkedInUrl: string;
  location: string;
  source: string;
  roleType: RecruitmentRoleType;
  stage: RecruitmentStage;
  experienceSummary: string;
  notes: string;
  nextAction: string;
  nextActionDate: string;
  compensationNotes: string;
  rejectionReason: string;
};

const emptyForm: FormState = {
  fullName: "",
  email: "",
  phone: "",
  linkedInUrl: "",
  location: "",
  source: "",
  roleType: "COMMISSION",
  stage: "SOURCED",
  experienceSummary: "",
  notes: "",
  nextAction: "",
  nextActionDate: "",
  compensationNotes: "",
  rejectionReason: "",
};

function formFromCandidate(candidate: RecruitmentCandidateDetail): FormState {
  return {
    fullName: candidate.fullName,
    email: candidate.email ?? "",
    phone: candidate.phone ?? "",
    linkedInUrl: candidate.linkedInUrl ?? "",
    location: candidate.location ?? "",
    source: candidate.source,
    roleType: candidate.roleType,
    stage: candidate.stage,
    experienceSummary: candidate.experienceSummary ?? "",
    notes: candidate.notes ?? "",
    nextAction: candidate.nextAction ?? "",
    nextActionDate: toDateInput(candidate.nextActionDate),
    compensationNotes: candidate.compensationNotes ?? "",
    rejectionReason: candidate.rejectionReason ?? "",
  };
}

export function RecruitmentWorkspace() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState("");
  const [roleType, setRoleType] = useState("");
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<RecruitmentCandidateDetail | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<RecruitmentCandidateSummary | null>(null);
  const debouncedSearch = useDebouncedValue(search);

  const metricsQuery = useQuery({
    queryKey: ["recruitment-metrics"],
    queryFn: () => api.get<{ metrics: RecruitmentMetrics }>("/recruitment/metrics"),
  });

  const listQuery = useQuery({
    queryKey: ["recruitment", debouncedSearch, stage, roleType, page],
    queryFn: () =>
      api.get<PaginatedResult<RecruitmentCandidateSummary>>(
        `/recruitment${toQuery({
          search: debouncedSearch,
          stage,
          roleType,
          page,
          pageSize: 20,
        })}`,
      ),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        ...form,
        email: form.email || null,
        phone: form.phone || null,
        linkedInUrl: form.linkedInUrl || null,
        location: form.location || null,
        experienceSummary: form.experienceSummary || null,
        notes: form.notes || null,
        nextAction: form.nextAction || null,
        nextActionDate: fromDateInput(form.nextActionDate) ?? null,
        compensationNotes: form.compensationNotes || null,
        rejectionReason: form.rejectionReason || null,
      };
      if (editing) {
        return api.patch<{ candidate: RecruitmentCandidateDetail }>(
          `/recruitment/${editing.id}`,
          payload,
        );
      }
      return api.post<{ candidate: RecruitmentCandidateDetail }>("/recruitment", payload);
    },
    onSuccess: async () => {
      toast.success(editing ? t("toasts.updated") : t("toasts.created"));
      setFormOpen(false);
      setEditing(null);
      setForm(emptyForm);
      await queryClient.invalidateQueries({ queryKey: ["recruitment"] });
      await queryClient.invalidateQueries({ queryKey: ["recruitment-metrics"] });
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : t("errors.saveFailed"));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/recruitment/${deleteTarget!.id}`),
    onSuccess: async () => {
      toast.success(t("toasts.deleted"));
      setDeleteTarget(null);
      await queryClient.invalidateQueries({ queryKey: ["recruitment"] });
      await queryClient.invalidateQueries({ queryKey: ["recruitment-metrics"] });
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : t("errors.deleteFailed"));
    },
  });

  async function openEdit(id: string) {
    try {
      const data = await api.get<{ candidate: RecruitmentCandidateDetail }>(
        `/recruitment/${id}`,
      );
      setEditing(data.candidate);
      setForm(formFromCandidate(data.candidate));
      setFormOpen(true);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : t("errors.loadFailed"));
    }
  }

  const metrics = metricsQuery.data?.metrics;

  return (
    <PageFrame width="wide">
      <PageHeader
        title={t("recruitment.title")}
        description={t("recruitment.description")}
        actions={
          <Can permission={PERMISSION_KEYS.RECRUITMENT_CREATE}>
            <Button
              onClick={() => {
                setEditing(null);
                setForm(emptyForm);
                setFormOpen(true);
              }}
            >
              <Plus className="size-4" />
              {t("recruitment.addCandidate")}
            </Button>
          </Can>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        {[
          ["total", metrics?.total],
          ["toContact", metrics?.toContact],
          ["inProcess", metrics?.inProcess],
          ["interviews", metrics?.interviews],
          ["offers", metrics?.offers],
          ["hired", metrics?.hired],
        ].map(([key, value]) => (
          <Surface key={key} className="p-4">
            <p className="text-xs text-muted-foreground">{t(`recruitment.${key}`)}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{value ?? "—"}</p>
          </Surface>
        ))}
      </div>

      {metrics?.byStage ? (
        <div className="flex flex-wrap gap-2">
          {metrics.byStage.map((row) => (
            <Badge key={row.stage} variant="secondary">
              {t(`recruitment.stages.${row.stage}`)} · {row.count}
            </Badge>
          ))}
        </div>
      ) : null}

      <DataToolbar>
        <ToolbarSearch
          value={search}
          onChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
          placeholder={t("common.search")}
        />
        <ToolbarFilter className="sm:min-w-44" label={t("recruitment.stage")}>
          <EnumSelect
            allowEmpty
            value={stage}
            onChange={(value) => {
              setStage(value);
              setPage(1);
            }}
            options={RECRUITMENT_STAGES.map((value) => ({
              value,
              label: t(`recruitment.stages.${value}`),
            }))}
            emptyLabel={t("filters.anyStage")}
            placeholder={t("filters.anyStage")}
          />
        </ToolbarFilter>
        <ToolbarFilter className="sm:min-w-48" label={t("recruitment.roleType")}>
          <EnumSelect
            allowEmpty
            value={roleType}
            onChange={(value) => {
              setRoleType(value);
              setPage(1);
            }}
            options={RECRUITMENT_ROLE_TYPES.map((value) => ({
              value,
              label: t(`recruitment.roleTypes.${value}`),
            }))}
            emptyLabel={t("filters.anyRoleType")}
            placeholder={t("filters.anyRoleType")}
          />
        </ToolbarFilter>
      </DataToolbar>

      <QueryPanel
        query={listQuery}
        skeleton={<TableSkeleton cols={8} />}
        errorMessage={t("errors.loadFailed")}
        isEmpty={(data) => data.items.length === 0}
        empty={
          <EmptyState
            icon={UserRoundSearch}
            title={t("recruitment.emptyTitle")}
            description={t("recruitment.emptyDescription")}
          />
        }
      >
        {(data) => (
          <>
            <Surface className="overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("recruitment.candidate")}</TableHead>
                    <TableHead>{t("recruitment.roleType")}</TableHead>
                    <TableHead>{t("recruitment.stage")}</TableHead>
                    <TableHead>{t("common.source")}</TableHead>
                    <TableHead>{t("recruitment.nextAction")}</TableHead>
                    <TableHead>{t("recruitment.nextActionDate")}</TableHead>
                    <TableHead>{t("recruitment.lastUpdated")}</TableHead>
                    <TableHead className="w-[88px] text-end">{t("common.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.map((candidate) => (
                    <TableRow key={candidate.id}>
                      <TableCell>
                        <div className="font-medium">{candidate.fullName}</div>
                        <div className="text-[13px] text-muted-foreground" dir="ltr">
                          {candidate.email || candidate.phone || "—"}
                        </div>
                      </TableCell>
                      <TableCell>{t(`recruitment.roleTypes.${candidate.roleType}`)}</TableCell>
                      <TableCell>{t(`recruitment.stages.${candidate.stage}`)}</TableCell>
                      <TableCell>{candidate.source}</TableCell>
                      <TableCell>{candidate.nextAction || t("common.none")}</TableCell>
                      <TableCell>
                        {candidate.nextActionDate
                          ? formatDate(candidate.nextActionDate)
                          : t("common.notScheduled")}
                      </TableCell>
                      <TableCell>{formatDate(candidate.updatedAt)}</TableCell>
                      <TableCell className="w-[88px] text-end">
                        <div className="inline-flex w-[76px] items-center justify-end gap-1">
                          <Can permission={PERMISSION_KEYS.RECRUITMENT_UPDATE}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  aria-label={t("common.edit")}
                                  onClick={() => void openEdit(candidate.id)}
                                >
                                  <Pencil className="size-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>{t("common.edit")}</TooltipContent>
                            </Tooltip>
                          </Can>
                          <Can permission={PERMISSION_KEYS.RECRUITMENT_DELETE}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  aria-label={t("common.delete")}
                                  onClick={() => setDeleteTarget(candidate)}
                                >
                                  <Trash2 className="size-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>{t("common.delete")}</TooltipContent>
                            </Tooltip>
                          </Can>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Surface>
            <PaginationBar
              page={page}
              pageSize={20}
              total={data.total}
              onPageChange={setPage}
            />
          </>
        )}
      </QueryPanel>

      <Dialog
        open={formOpen}
        onOpenChange={(next) => {
          if (saveMutation.isPending) {
            return;
          }
          setFormOpen(next);
          if (!next) {
            setEditing(null);
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <form
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              saveMutation.mutate();
            }}
          >
            <DialogHeader className="sm:col-span-2">
              <DialogTitle>
                {editing ? t("recruitment.editCandidate") : t("recruitment.addCandidate")}
              </DialogTitle>
              <DialogDescription>{t("recruitment.formDescription")}</DialogDescription>
            </DialogHeader>
            <FormField label={t("common.name")} htmlFor="rec-name" required>
              <Input
                id="rec-name"
                value={form.fullName}
                onChange={(event) => setForm({ ...form, fullName: event.target.value })}
              />
            </FormField>
            <FormField label={t("common.source")} htmlFor="rec-source" required>
              <Input
                id="rec-source"
                value={form.source}
                onChange={(event) => setForm({ ...form, source: event.target.value })}
              />
            </FormField>
            <FormField label={t("common.email")} htmlFor="rec-email">
              <Input
                id="rec-email"
                dir="ltr"
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
              />
            </FormField>
            <FormField label={t("common.phone")} htmlFor="rec-phone">
              <Input
                id="rec-phone"
                dir="ltr"
                value={form.phone}
                onChange={(event) => setForm({ ...form, phone: event.target.value })}
              />
            </FormField>
            <FormField label="LinkedIn" htmlFor="rec-linkedin">
              <Input
                id="rec-linkedin"
                dir="ltr"
                value={form.linkedInUrl}
                onChange={(event) => setForm({ ...form, linkedInUrl: event.target.value })}
              />
            </FormField>
            <FormField label={t("recruitment.location")} htmlFor="rec-location">
              <Input
                id="rec-location"
                value={form.location}
                onChange={(event) => setForm({ ...form, location: event.target.value })}
              />
            </FormField>
            <FormField label={t("recruitment.roleType")} required>
              <EnumSelect
                value={form.roleType}
                onChange={(value) =>
                  setForm({ ...form, roleType: value as RecruitmentRoleType })
                }
                options={RECRUITMENT_ROLE_TYPES.map((value) => ({
                  value,
                  label: t(`recruitment.roleTypes.${value}`),
                }))}
              />
            </FormField>
            <FormField label={t("recruitment.stage")} required>
              <EnumSelect
                value={form.stage}
                onChange={(value) =>
                  setForm({ ...form, stage: value as RecruitmentStage })
                }
                options={RECRUITMENT_STAGES.map((value) => ({
                  value,
                  label: t(`recruitment.stages.${value}`),
                }))}
              />
            </FormField>
            <FormField label={t("recruitment.nextAction")} htmlFor="rec-next">
              <Input
                id="rec-next"
                value={form.nextAction}
                onChange={(event) => setForm({ ...form, nextAction: event.target.value })}
              />
            </FormField>
            <FormField label={t("recruitment.nextActionDate")}>
              <DateTimePicker
                includeTime
                value={form.nextActionDate}
                onChange={(value) => setForm({ ...form, nextActionDate: value })}
              />
            </FormField>
            <div className="sm:col-span-2">
              <FormField label={t("recruitment.experienceSummary")} htmlFor="rec-exp">
                <Textarea
                  id="rec-exp"
                  value={form.experienceSummary}
                  onChange={(event) =>
                    setForm({ ...form, experienceSummary: event.target.value })
                  }
                />
              </FormField>
            </div>
            <div className="sm:col-span-2">
              <FormField label={t("common.notes")} htmlFor="rec-notes">
                <Textarea
                  id="rec-notes"
                  value={form.notes}
                  onChange={(event) => setForm({ ...form, notes: event.target.value })}
                />
              </FormField>
            </div>
            <div className="sm:col-span-2">
              <FormField label={t("recruitment.compensationNotes")} htmlFor="rec-comp">
                <Textarea
                  id="rec-comp"
                  value={form.compensationNotes}
                  onChange={(event) =>
                    setForm({ ...form, compensationNotes: event.target.value })
                  }
                />
              </FormField>
            </div>
            {form.stage === "REJECTED" ? (
              <div className="sm:col-span-2">
                <FormField label={t("recruitment.rejectionReason")} htmlFor="rec-reject">
                  <Textarea
                    id="rec-reject"
                    value={form.rejectionReason}
                    onChange={(event) =>
                      setForm({ ...form, rejectionReason: event.target.value })
                    }
                  />
                </FormField>
              </div>
            ) : null}
            <DialogFooter className="sm:col-span-2">
              <Button
                type="button"
                variant="outline"
                disabled={saveMutation.isPending}
                onClick={() => setFormOpen(false)}
              >
                {t("common.cancel")}
              </Button>
              <Button type="submit" loading={saveMutation.isPending}>
                {saveMutation.isPending ? t("common.saving") : t("common.save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

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
              {t("recruitment.deleteConfirm", { name: deleteTarget?.fullName ?? "" })}
            </AlertDialogTitle>
            <AlertDialogDescription>{t("common.deleteConfirm")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteMutation.isPending}
              onClick={(event) => {
                event.preventDefault();
                deleteMutation.mutate();
              }}
            >
              {deleteMutation.isPending ? t("common.deleting") : t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageFrame>
  );
}
