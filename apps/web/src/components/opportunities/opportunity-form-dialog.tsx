"use client";

import {
  defaultProbabilityForStage,
  OPPORTUNITY_STAGES,
  type CreateOpportunityInput,
  type OpportunityDetail,
  type OpportunityStage,
} from "@nbs/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { CompanySelect, ContactSelect, EnumSelect, FormField, UserSelect } from "@/components/crm/selects";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/i18n/provider";
import { api, ApiError } from "@/lib/api";
import { fromDateInput, toDateInput } from "@/lib/format";

interface OpportunityFormState {
  companyId: string;
  name: string;
  stage: OpportunityStage;
  primaryContactId: string | null;
  summary: string;
  confirmedProblem: string;
  businessImpact: string;
  proposedSolution: string;
  estimatedValue: string;
  probability: string;
  source: string;
  ownerId: string | null;
  expectedCloseDate: string;
  lostReason: string;
}

function emptyForm(companyId?: string): OpportunityFormState {
  return {
    companyId: companyId ?? "",
    name: "",
    stage: "TARGET",
    primaryContactId: null,
    summary: "",
    confirmedProblem: "",
    businessImpact: "",
    proposedSolution: "",
    estimatedValue: "",
    probability: String(defaultProbabilityForStage("TARGET")),
    source: "",
    ownerId: null,
    expectedCloseDate: "",
    lostReason: "",
  };
}

export function OpportunityFormDialog({
  open,
  onOpenChange,
  companyId,
  opportunity,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId?: string;
  opportunity?: OpportunityDetail | null;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<OpportunityFormState>(
    opportunity
      ? {
          companyId: opportunity.companyId,
          name: opportunity.name,
          stage: opportunity.stage,
          primaryContactId: opportunity.primaryContact?.id ?? null,
          summary: opportunity.summary ?? "",
          confirmedProblem: opportunity.confirmedProblem ?? "",
          businessImpact: opportunity.businessImpact ?? "",
          proposedSolution: opportunity.proposedSolution ?? "",
          estimatedValue: opportunity.estimatedValue ?? "",
          probability: String(opportunity.probability),
          source: opportunity.source ?? "",
          ownerId: opportunity.owner?.id ?? null,
          expectedCloseDate: toDateInput(opportunity.expectedCloseDate),
          lostReason: opportunity.lostReason ?? "",
        }
      : emptyForm(companyId),
  );

  const mutation = useMutation({
    mutationFn: (input: CreateOpportunityInput) => {
      if (opportunity) {
        return api.patch<{ opportunity: OpportunityDetail }>(
          `/opportunities/${opportunity.id}`,
          input,
        );
      }
      return api.post<{ opportunity: OpportunityDetail }>("/opportunities", input);
    },
    onSuccess: async () => {
      toast.success(
        opportunity ? t("toasts.opportunityUpdated") : t("toasts.opportunityCreated"),
      );
      onOpenChange(false);
      await queryClient.invalidateQueries({ queryKey: ["opportunities"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      await queryClient.invalidateQueries({ queryKey: ["companies"] });
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : t("opportunities.saveFailed"));
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (next && !opportunity) {
          setForm(emptyForm(companyId));
        }
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {opportunity ? t("opportunities.edit") : t("opportunities.add")}
          </DialogTitle>
          <DialogDescription>{t("opportunities.formDescription")}</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate({
              companyId: form.companyId,
              name: form.name,
              stage: form.stage,
              primaryContactId: form.primaryContactId,
              summary: form.summary,
              confirmedProblem: form.confirmedProblem,
              businessImpact: form.businessImpact,
              proposedSolution: form.proposedSolution,
              estimatedValue: form.estimatedValue || null,
              probability: Number(form.probability),
              source: form.source,
              ownerId: form.ownerId,
              expectedCloseDate: fromDateInput(form.expectedCloseDate) ?? null,
              lostReason: form.lostReason,
              outcomeNotes: null,
            });
          }}
        >
          {!companyId ? (
            <div className="sm:col-span-2">
              <FormField label={t("opportunities.company")} required>
                <CompanySelect
                  value={form.companyId}
                  onChange={(value) =>
                    setForm({ ...form, companyId: value, primaryContactId: null })
                  }
                />
              </FormField>
            </div>
          ) : null}
          <FormField label={t("opportunities.opportunity")} htmlFor="opp-name" required>
            <Input
              id="opp-name"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
          </FormField>
          <FormField label={t("opportunities.stage")} required>
            <EnumSelect
              value={form.stage}
              onChange={(value) => {
                const stage = (value || "TARGET") as OpportunityStage;
                setForm({
                  ...form,
                  stage,
                  probability: String(defaultProbabilityForStage(stage)),
                });
              }}
              options={OPPORTUNITY_STAGES.map((value) => ({
                value,
                label: t(`enums.opportunityStage.${value}`),
              }))}
            />
          </FormField>
          <FormField label={t("opportunities.primaryContact")}>
            <ContactSelect
              allowEmpty
              companyId={form.companyId}
              value={form.primaryContactId}
              onChange={(value) => setForm({ ...form, primaryContactId: value })}
            />
          </FormField>
          <FormField label={t("opportunities.owner")}>
            <UserSelect
              allowEmpty
              value={form.ownerId}
              onChange={(value) => setForm({ ...form, ownerId: value })}
            />
          </FormField>
          <FormField label={t("opportunities.estimatedValue")} htmlFor="opp-value">
            <Input
              id="opp-value"
              inputMode="decimal"
              value={form.estimatedValue}
              onChange={(event) => setForm({ ...form, estimatedValue: event.target.value })}
            />
          </FormField>
          <FormField label={t("opportunities.probability")} htmlFor="opp-probability">
            <Input
              id="opp-probability"
              type="number"
              min={0}
              max={100}
              value={form.probability}
              onChange={(event) => setForm({ ...form, probability: event.target.value })}
            />
          </FormField>
          <FormField label={t("opportunities.expectedClose")} htmlFor="opp-close">
            <DateTimePicker
              id="opp-close"
              value={form.expectedCloseDate}
              onChange={(value) => setForm({ ...form, expectedCloseDate: value })}
            />
          </FormField>
          <FormField label={t("opportunities.source")} htmlFor="opp-source">
            <Input
              id="opp-source"
              value={form.source}
              onChange={(event) => setForm({ ...form, source: event.target.value })}
            />
          </FormField>
          <div className="sm:col-span-2">
            <FormField label={t("opportunities.summary")} htmlFor="opp-summary">
              <Textarea
                id="opp-summary"
                value={form.summary}
                onChange={(event) => setForm({ ...form, summary: event.target.value })}
              />
            </FormField>
          </div>
          <div className="sm:col-span-2">
            <FormField label={t("opportunities.confirmedProblem")} htmlFor="opp-problem">
              <Textarea
                id="opp-problem"
                value={form.confirmedProblem}
                onChange={(event) => setForm({ ...form, confirmedProblem: event.target.value })}
              />
            </FormField>
          </div>
          <div className="sm:col-span-2">
            <FormField label={t("opportunities.businessImpact")} htmlFor="opp-impact">
              <Textarea
                id="opp-impact"
                value={form.businessImpact}
                onChange={(event) => setForm({ ...form, businessImpact: event.target.value })}
              />
            </FormField>
          </div>
          <div className="sm:col-span-2">
            <FormField label={t("opportunities.proposedSolution")} htmlFor="opp-solution">
              <Textarea
                id="opp-solution"
                value={form.proposedSolution}
                onChange={(event) => setForm({ ...form, proposedSolution: event.target.value })}
              />
            </FormField>
          </div>
          {form.stage === "LOST" ? (
            <div className="sm:col-span-2">
              <FormField label={t("opportunities.lostReason")} htmlFor="opp-lost">
                <Textarea
                  id="opp-lost"
                  value={form.lostReason}
                  onChange={(event) => setForm({ ...form, lostReason: event.target.value })}
                />
              </FormField>
            </div>
          ) : null}
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" loading={mutation.isPending}>
              {t("opportunities.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
