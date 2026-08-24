"use client";

import {
  PERMISSION_KEYS,
  type ActivityRecord,
  type CompanyDetail,
  type ContactSummary,
  type HypothesisRecord,
  type OpportunitySummary,
  type PaginatedResult,
  type ResearchEvidenceRecord,
  type TaskRecord,
} from "@nbs/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, LoaderCircle, Plus, Trash2 } from "lucide-react";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ActivityFormDialog } from "@/components/activities/activity-form-dialog";
import { CompanyFormDialog } from "@/components/companies/companies-workspace";
import { ContactFormDialog } from "@/components/contacts/contact-form-dialog";
import { DestinationReady } from "@/components/layout/destination-ready";
import {
  DetailSkeleton,
  Fact,
  PageFrame,
  PriorityBadge,
  QualificationLabel,
  ServiceError,
  Surface,
} from "@/components/crm/primitives";
import { OpportunityFormDialog } from "@/components/opportunities/opportunity-form-dialog";
import { Can } from "@/components/permission-gate";
import {
  EvidenceFormDialog,
  HypothesisFormDialog,
  HypothesisStatusSelect,
} from "@/components/research/research-forms";
import { TaskFormDialog } from "@/components/tasks/task-form-dialog";
import { Badge } from "@/components/ui/badge";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useI18n } from "@/i18n/provider";
import { api, ApiError } from "@/lib/api";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { navigateTo } from "@/lib/navigate";
import { toQuery } from "@/lib/query";
import { cn } from "@/lib/utils";

function dueClass(dueAt: string, status: TaskRecord["status"]): string {
  if (status !== "OPEN") {
    return "text-muted-foreground";
  }
  const due = new Date(dueAt);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDay = new Date(due);
  dueDay.setHours(0, 0, 0, 0);
  if (dueDay < today) {
    return "text-destructive";
  }
  if (dueDay.getTime() === today.getTime()) {
    return "text-warning";
  }
  return "text-muted-foreground";
}

export function CompanyDetailView() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const [editOpen, setEditOpen] = useState(false);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [hypothesisOpen, setHypothesisOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [opportunityOpen, setOpportunityOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const companyQuery = useQuery({
    queryKey: ["company", id],
    queryFn: () => api.get<{ company: CompanyDetail }>(`/companies/${id}`),
  });
  const evidenceQuery = useQuery({
    queryKey: ["evidence", id],
    queryFn: () =>
      api.get<{ evidence: ResearchEvidenceRecord[] }>(`/companies/${id}/evidence`),
  });
  const hypothesesQuery = useQuery({
    queryKey: ["hypotheses", id],
    queryFn: () =>
      api.get<{ hypotheses: HypothesisRecord[] }>(`/companies/${id}/hypotheses`),
  });
  const contactsQuery = useQuery({
    queryKey: ["contacts", { companyId: id }],
    queryFn: () =>
      api.get<PaginatedResult<ContactSummary>>(
        `/contacts${toQuery({ companyId: id, pageSize: 50 })}`,
      ),
  });
  const opportunitiesQuery = useQuery({
    queryKey: ["opportunities", { companyId: id }],
    queryFn: () =>
      api.get<PaginatedResult<OpportunitySummary>>(
        `/opportunities${toQuery({ companyId: id, pageSize: 50 })}`,
      ),
  });
  const activitiesQuery = useQuery({
    queryKey: ["activities", { companyId: id }],
    queryFn: () =>
      api.get<PaginatedResult<ActivityRecord>>(
        `/activities${toQuery({ companyId: id, pageSize: 20 })}`,
      ),
  });
  const tasksQuery = useQuery({
    queryKey: ["tasks", { companyId: id }],
    queryFn: () =>
      api.get<PaginatedResult<TaskRecord>>(
        `/tasks${toQuery({ companyId: id, pageSize: 20, status: "OPEN" })}`,
      ),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/companies/${id}`),
    onSuccess: async () => {
      toast.success(t("toasts.companyDeleted"));
      await queryClient.invalidateQueries({ queryKey: ["companies"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      navigateTo(router, "/companies", pathname);
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : t("companies.deleteFailed"));
    },
  });

  const completeMutation = useMutation({
    mutationFn: (taskId: string) => api.post(`/tasks/${taskId}/complete`),
    onSuccess: async () => {
      toast.success(t("toasts.followUpCompleted"));
      await queryClient.invalidateQueries({ queryKey: ["tasks"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  const company = companyQuery.data?.company;

  if (companyQuery.isPending && !company) {
    return (
      <PageFrame>
        <DestinationReady ready={false} />
        <DetailSkeleton />
      </PageFrame>
    );
  }

  if (companyQuery.isError || !company) {
    return (
      <PageFrame>
        <DestinationReady ready />
        <ServiceError
          error={companyQuery.error}
          onRetry={() => {
            void companyQuery.refetch();
          }}
          message={t("companies.detailLoadFailed")}
        />
      </PageFrame>
    );
  }

  return (
    <PageFrame>
      <DestinationReady ready />
      <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[1.65rem] font-semibold tracking-[-0.03em]">{company.name}</h2>
            <PriorityBadge priority={company.priority} />
          </div>
          <p className="text-sm text-muted-foreground">
            {company.sector || t("common.noSector")} · {t(`enums.companySize.${company.companySize}`)} ·{" "}
            {company.owner?.name ?? t("common.unassigned")}
          </p>
          {company.website ? (
            <a
              href={company.website.startsWith("http") ? company.website : `https://${company.website}`}
              className="text-sm text-primary"
              target="_blank"
              rel="noreferrer"
              dir="ltr"
            >
              {company.website}
            </a>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Can permission={PERMISSION_KEYS.ACTIVITIES_CREATE}>
            <Button variant="outline" onClick={() => setActivityOpen(true)}>
              {t("companies.logActivity")}
            </Button>
          </Can>
          <Can permission={PERMISSION_KEYS.COMPANIES_UPDATE}>
            <Button onClick={() => setEditOpen(true)}>{t("common.edit")}</Button>
          </Can>
          <Can permission={PERMISSION_KEYS.COMPANIES_DELETE}>
            <Button variant="outline" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="size-4" />
              {t("common.delete")}
            </Button>
          </Can>
        </div>
      </div>

      <Surface className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
        <Fact
          label={t("companies.qualification")}
          value={
            <QualificationLabel
              score={company.qualificationScore}
              accessPending={company.accessPending}
            />
          }
        />
        <Fact label={t("companies.activeOpportunities")} value={company.activeOpportunityCount} />
        <Fact label={t("companies.openFollowUps")} value={company.openTaskCount} />
        <Fact label={t("companies.lastActivity")} value={formatDate(company.lastActivityAt)} />
      </Surface>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">{t("companies.overview")}</TabsTrigger>
          <TabsTrigger value="research">{t("companies.research")}</TabsTrigger>
          <TabsTrigger value="contacts">{t("companies.contacts")}</TabsTrigger>
          <TabsTrigger value="opportunities">{t("companies.opportunities")}</TabsTrigger>
          <TabsTrigger value="activity">{t("companies.activity")}</TabsTrigger>
          <TabsTrigger value="followups">{t("companies.followUps")}</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Surface className="p-5">
              <h3 className="text-sm font-medium">{t("companies.identity")}</h3>
              <dl className="mt-4 space-y-3 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">{t("companies.source")}</dt>
                  <dd>{t(`enums.companySource.${company.source}`)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">{t("companies.locations")}</dt>
                  <dd className="text-right">{company.locations || t("common.dash")}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">{t("companies.fitProblemAccess")}</dt>
                  <dd>
                    {[company.companyFit, company.problemPotential, company.decisionMakerAccess]
                      .map((value) => value ?? t("common.dash"))
                      .join(" / ")}
                  </dd>
                </div>
              </dl>
            </Surface>
            <Surface className="p-5">
              <h3 className="text-sm font-medium">{t("companies.notes")}</h3>
              <p className="mt-4 text-sm leading-6 text-muted-foreground">
                {company.generalNotes || t("companies.noNotes")}
              </p>
            </Surface>
          </div>
        </TabsContent>
        <TabsContent value="research" className="grid gap-4 lg:grid-cols-2">
          <Surface className="p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-medium">{t("companies.publicEvidence")}</h3>
                <p className="text-sm text-muted-foreground">{t("companies.publicEvidenceHint")}</p>
              </div>
              <Can permission={PERMISSION_KEYS.COMPANIES_UPDATE}>
                <Button size="sm" onClick={() => setEvidenceOpen(true)}>
                  <Plus className="size-4" />
                  {t("common.add")}
                </Button>
              </Can>
            </div>
            <div className="mt-4 space-y-3">
              {(evidenceQuery.data?.evidence ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("companies.noEvidence")}</p>
              ) : (
                evidenceQuery.data?.evidence.map((item) => (
                  <article key={item.id} className="rounded-lg border border-border p-3">
                    <p className="font-medium">{item.title}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{item.details}</p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {item.sourceName || item.sourceUrl || t("companies.publicSource")} · {formatDate(item.observedAt ?? item.createdAt)}
                    </p>
                  </article>
                ))
              )}
            </div>
          </Surface>
          <Surface className="p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-medium">{t("companies.hypotheses")}</h3>
                <p className="text-sm text-muted-foreground">
                  {t("companies.hypothesesHint")}
                </p>
              </div>
              <Can permission={PERMISSION_KEYS.COMPANIES_UPDATE}>
                <Button size="sm" onClick={() => setHypothesisOpen(true)}>
                  <Plus className="size-4" />
                  {t("common.add")}
                </Button>
              </Can>
            </div>
            <div className="mt-4 space-y-3">
              {(hypothesesQuery.data?.hypotheses ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("companies.noHypotheses")}</p>
              ) : (
                hypothesesQuery.data?.hypotheses.map((item) => (
                  <article key={item.id} className="space-y-3 rounded-lg border border-border p-3">
                    <p className="text-sm">{item.statement}</p>
                    <HypothesisStatusSelect hypothesis={item} />
                    <p className="text-xs text-muted-foreground">
                      {t(`enums.hypothesisStatus.${item.status}`)} · {item.createdBy.name}
                    </p>
                  </article>
                ))
              )}
            </div>
          </Surface>
        </TabsContent>
        <TabsContent value="contacts">
          <div className="mb-4 flex justify-end">
            <Can permission={PERMISSION_KEYS.CONTACTS_CREATE}>
              <Button onClick={() => setContactOpen(true)}>
                <Plus className="size-4" />
                {t("companies.addContact")}
              </Button>
            </Can>
          </div>
          <div className="space-y-3">
            {(contactsQuery.data?.items ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("companies.noContacts")}</p>
            ) : (
              contactsQuery.data?.items.map((contact) => (
                <button
                  key={contact.id}
                  type="button"
                  className="flex w-full cursor-pointer items-center justify-between rounded-lg bg-muted/40 px-4 py-3 text-left hover:bg-muted/70"
                  onClick={() => navigateTo(router, `/contacts/${contact.id}`, pathname)}
                >
                  <div>
                    <p className="font-medium">{contact.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {contact.jobTitle || t("common.noTitle")} · {t(`enums.decisionRole.${contact.decisionRole}`)}
                    </p>
                  </div>
                  {contact.isPrimary ? <Badge>{t("common.primary")}</Badge> : null}
                </button>
              ))
            )}
          </div>
        </TabsContent>
        <TabsContent value="opportunities">
          <div className="mb-4 flex justify-end">
            <Can permission={PERMISSION_KEYS.OPPORTUNITIES_CREATE}>
              <Button onClick={() => setOpportunityOpen(true)}>
                <Plus className="size-4" />
                {t("companies.addOpportunity")}
              </Button>
            </Can>
          </div>
          <div className="space-y-3">
            {(opportunitiesQuery.data?.items ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("companies.noOpportunities")}</p>
            ) : (
              opportunitiesQuery.data?.items.map((opportunity) => (
                <button
                  key={opportunity.id}
                  type="button"
                  className="flex w-full cursor-pointer items-center justify-between rounded-lg bg-muted/40 px-4 py-3 text-left hover:bg-muted/70"
                  onClick={() => navigateTo(router, `/opportunities/${opportunity.id}`, pathname)}
                >
                  <div>
                    <p className="font-medium">{opportunity.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {t(`enums.opportunityStage.${opportunity.stage}`)} · {formatMoney(opportunity.estimatedValue)}
                    </p>
                  </div>
                  <span className="text-sm text-muted-foreground">{opportunity.probability}%</span>
                </button>
              ))
            )}
          </div>
        </TabsContent>
        <TabsContent value="activity" className="space-y-4">
          <div className="flex justify-end">
            <Can permission={PERMISSION_KEYS.ACTIVITIES_CREATE}>
              <Button onClick={() => setActivityOpen(true)}>{t("companies.logActivity")}</Button>
            </Can>
          </div>
          <ol className="space-y-3">
            {(activitiesQuery.data?.items ?? []).map((activity) => (
              <li key={activity.id} className="rounded-lg bg-muted/40 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <Badge variant="secondary">{t(`enums.activityType.${activity.type}`)}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {formatDateTime(activity.occurredAt)}
                  </span>
                </div>
                <p className="mt-2 text-sm">{activity.summary}</p>
                {activity.outcome ? (
                  <p className="mt-1 text-sm text-muted-foreground">{activity.outcome}</p>
                ) : null}
                <p className="mt-2 text-xs text-muted-foreground">
                  {activity.contactName ? `${activity.contactName} · ` : ""}
                  {activity.owner.name}
                </p>
              </li>
            ))}
          </ol>
        </TabsContent>
        <TabsContent value="followups" className="space-y-4">
          <div className="flex justify-end">
            <Can permission={PERMISSION_KEYS.TASKS_CREATE}>
              <Button onClick={() => setTaskOpen(true)}>{t("companies.addFollowUp")}</Button>
            </Can>
          </div>
          <div className="space-y-3">
            {(tasksQuery.data?.items ?? []).map((task) => (
              <div key={task.id} className="flex items-start justify-between gap-3 rounded-lg bg-muted/40 px-4 py-3">
                <div>
                  <p className="font-medium">{task.title}</p>
                  <p className={cn("text-sm", dueClass(task.dueAt, task.status))}>
                    {t("companies.dueOwned", {
                      datetime: formatDateTime(task.dueAt),
                      owner: task.owner.name,
                    })}
                  </p>
                </div>
                <Can permission={PERMISSION_KEYS.TASKS_UPDATE}>
                  <Button
                    size="icon"
                    variant="outline"
                    aria-label={t("companies.completeFollowUp")}
                    onClick={() => completeMutation.mutate(task.id)}
                  >
                    <Check className="size-4" />
                  </Button>
                </Can>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      <CompanyFormDialog open={editOpen} onOpenChange={setEditOpen} company={company} />
      <EvidenceFormDialog companyId={id} open={evidenceOpen} onOpenChange={setEvidenceOpen} />
      <HypothesisFormDialog companyId={id} open={hypothesisOpen} onOpenChange={setHypothesisOpen} />
      <ContactFormDialog companyId={id} open={contactOpen} onOpenChange={setContactOpen} />
      <OpportunityFormDialog companyId={id} open={opportunityOpen} onOpenChange={setOpportunityOpen} />
      <ActivityFormDialog companyId={id} open={activityOpen} onOpenChange={setActivityOpen} />
      <TaskFormDialog companyId={id} open={taskOpen} onOpenChange={setTaskOpen} />
      <AlertDialog
        open={deleteOpen}
        onOpenChange={(next) => {
          if (deleteMutation.isPending) {
            return;
          }
          setDeleteOpen(next);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("companies.deleteTitle", { name: company.name })}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("companies.deleteBody")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>{t("common.cancel")}</AlertDialogCancel>
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
    </div>
    </PageFrame>
  );
}
