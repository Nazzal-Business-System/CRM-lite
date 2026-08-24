"use client";

import {
  EVIDENCE_CATEGORIES,
  HYPOTHESIS_STATUSES,
  type CreateEvidenceInput,
  type CreateHypothesisInput,
  type EvidenceCategory,
  type HypothesisRecord,
  type ResearchEvidenceRecord,
} from "@nbs/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { EnumSelect, FormField } from "@/components/crm/selects";
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

export function EvidenceFormDialog({
  companyId,
  open,
  onOpenChange,
}: {
  companyId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [category, setCategory] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [observedAt, setObservedAt] = useState("");

  const mutation = useMutation({
    mutationFn: (input: CreateEvidenceInput) =>
      api.post<{ evidence: ResearchEvidenceRecord }>(
        `/companies/${companyId}/evidence`,
        input,
      ),
    onSuccess: async () => {
      toast.success(t("toasts.evidenceAdded"));
      onOpenChange(false);
      setTitle("");
      setDetails("");
      setCategory("");
      setSourceUrl("");
      setSourceName("");
      setObservedAt("");
      await queryClient.invalidateQueries({ queryKey: ["evidence", companyId] });
      await queryClient.invalidateQueries({ queryKey: ["research"] });
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : t("research.saveEvidenceFailed"));
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("research.addEvidence")}</DialogTitle>
          <DialogDescription>{t("research.addEvidenceDescription")}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate({
              title,
              details,
              category: (category || null) as EvidenceCategory | null,
              sourceUrl,
              sourceName,
              observedAt: observedAt || null,
            });
          }}
        >
          <FormField label={t("research.summary")} htmlFor="evidence-title" required>
            <Input id="evidence-title" value={title} onChange={(event) => setTitle(event.target.value)} />
          </FormField>
          <FormField label={t("research.details")} htmlFor="evidence-details" required>
            <Textarea
              id="evidence-details"
              value={details}
              onChange={(event) => setDetails(event.target.value)}
            />
          </FormField>
          <FormField label={t("research.category")}>
            <EnumSelect
              allowEmpty
              value={category}
              onChange={setCategory}
              options={EVIDENCE_CATEGORIES.map((value) => ({
                value,
                label: t(`enums.evidenceCategory.${value}`),
              }))}
            />
          </FormField>
          <FormField label={t("research.sourceName")} htmlFor="evidence-source">
            <Input
              id="evidence-source"
              value={sourceName}
              onChange={(event) => setSourceName(event.target.value)}
            />
          </FormField>
          <FormField label={t("research.sourceUrl")} htmlFor="evidence-url">
            <Input
              id="evidence-url"
              value={sourceUrl}
              onChange={(event) => setSourceUrl(event.target.value)}
            />
          </FormField>
          <FormField label={t("research.observed")} htmlFor="evidence-observed">
            <DateTimePicker
              id="evidence-observed"
              includeTime
              value={observedAt}
              onChange={setObservedAt}
            />
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" loading={mutation.isPending}>
              {t("research.saveEvidence")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function HypothesisFormDialog({
  companyId,
  open,
  onOpenChange,
}: {
  companyId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [statement, setStatement] = useState("");
  const [supportingContext, setSupportingContext] = useState("");

  const mutation = useMutation({
    mutationFn: (input: CreateHypothesisInput) =>
      api.post<{ hypothesis: HypothesisRecord }>(
        `/companies/${companyId}/hypotheses`,
        input,
      ),
    onSuccess: async () => {
      toast.success(t("toasts.hypothesisAdded"));
      onOpenChange(false);
      setStatement("");
      setSupportingContext("");
      await queryClient.invalidateQueries({ queryKey: ["hypotheses", companyId] });
      await queryClient.invalidateQueries({ queryKey: ["research"] });
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : t("research.saveHypothesisFailed"));
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("research.addHypothesis")}</DialogTitle>
          <DialogDescription>{t("research.addHypothesisDescription")}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate({
              statement,
              supportingContext,
              status: "UNTESTED",
            });
          }}
        >
          <FormField label={t("research.statement")} htmlFor="hypothesis-statement" required>
            <Textarea
              id="hypothesis-statement"
              value={statement}
              onChange={(event) => setStatement(event.target.value)}
            />
          </FormField>
          <FormField label={t("research.supportingContext")} htmlFor="hypothesis-context">
            <Textarea
              id="hypothesis-context"
              value={supportingContext}
              onChange={(event) => setSupportingContext(event.target.value)}
            />
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" loading={mutation.isPending}>
              {t("research.saveHypothesis")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function HypothesisStatusSelect({
  hypothesis,
}: {
  hypothesis: HypothesisRecord;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (status: HypothesisRecord["status"]) =>
      api.patch<{ hypothesis: HypothesisRecord }>(`/hypotheses/${hypothesis.id}`, { status }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["hypotheses"] });
      await queryClient.invalidateQueries({ queryKey: ["research"] });
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : t("research.updateHypothesisFailed"));
    },
  });

  return (
    <EnumSelect
      value={hypothesis.status}
      onChange={(value) => {
        if (value) {
          mutation.mutate(value as HypothesisRecord["status"]);
        }
      }}
      options={HYPOTHESIS_STATUSES.map((value) => ({
        value,
        label: t(`enums.hypothesisStatus.${value}`),
      }))}
    />
  );
}
