"use client";

import {
  ACTIVITY_TYPES,
  PERMISSION_KEYS,
  type ActivityRecord,
  type CreateActivityInput,
  type UpdateActivityInput,
} from "@nbs/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Can } from "@/components/permission-gate";
import { CompanySelect, ContactSelect, EnumSelect, FormField } from "@/components/crm/selects";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { useAuth } from "@/providers/auth-provider";

export function ActivityFormDialog({
  open,
  onOpenChange,
  companyId,
  opportunityId,
  contactId,
  activity,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId?: string;
  opportunityId?: string;
  contactId?: string;
  activity?: ActivityRecord | null;
}) {
  const { t } = useI18n();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [type, setType] = useState<string>(activity?.type ?? "MEETING");
  const [selectedCompanyId, setSelectedCompanyId] = useState(activity?.companyId ?? companyId ?? "");
  const [selectedContactId, setSelectedContactId] = useState<string | null>(activity?.contactId ?? contactId ?? null);
  const [selectedOpportunityId, setSelectedOpportunityId] = useState(activity?.opportunityId ?? opportunityId ?? "");
  const [occurredAt, setOccurredAt] = useState(activity?.occurredAt ?? new Date().toISOString());
  const [summary, setSummary] = useState(activity?.summary ?? "");
  const [outcome, setOutcome] = useState(activity?.outcome ?? "");
  const [createFollowUp, setCreateFollowUp] = useState(false);
  const [followUpTitle, setFollowUpTitle] = useState("");
  const [followUpDue, setFollowUpDue] = useState("");

  const mutation = useMutation({
    mutationFn: (input: CreateActivityInput) => activity
      ? api.patch<{ activity: ActivityRecord }>(`/activities/${activity.id}`, input as UpdateActivityInput)
      : api.post<{ activity: ActivityRecord }>("/activities", input),
    onSuccess: async () => {
      toast.success(t(activity ? "toasts.activityUpdated" : "toasts.activityLogged"));
      onOpenChange(false);
      setSummary("");
      setOutcome("");
      setCreateFollowUp(false);
      setFollowUpTitle("");
      setFollowUpDue("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["activities"] }),
        queryClient.invalidateQueries({ queryKey: ["tasks"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["companies"] }),
        queryClient.invalidateQueries({ queryKey: ["opportunities"] }),
      ]);
      await queryClient.refetchQueries({ queryKey: ["dashboard"] });
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : t("activities.saveFailed"));
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (next) {
          setSelectedCompanyId(activity?.companyId ?? companyId ?? "");
          setSelectedContactId(activity?.contactId ?? contactId ?? null);
          setSelectedOpportunityId(activity?.opportunityId ?? opportunityId ?? "");
          setType(activity?.type ?? "MEETING");
          setOccurredAt(activity?.occurredAt ?? new Date().toISOString());
          setSummary(activity?.summary ?? "");
          setOutcome(activity?.outcome ?? "");
        }
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t(activity ? "activities.edit" : "activities.add")}</DialogTitle>
          <DialogDescription>{t("activities.formDescription")}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (mutation.isPending) return;
            mutation.mutate({
              companyId: selectedCompanyId,
              contactId: selectedContactId,
              opportunityId: selectedOpportunityId || null,
              type: type as CreateActivityInput["type"],
              occurredAt,
              summary,
              outcome: outcome.trim() || null,
              ownerId: user?.id,
              nextTask:
                !activity && createFollowUp && followUpTitle && followUpDue
                  ? {
                      title: followUpTitle,
                      dueAt: followUpDue,
                      description: null,
                      ownerId: user?.id,
                    }
                  : undefined,
            });
          }}
        >
          <FormField label={t("activities.type")} required>
            <EnumSelect
              value={type}
              onChange={setType}
              options={ACTIVITY_TYPES.map((value) => ({
                value,
                label: t(`enums.activityType.${value}`),
              }))}
            />
          </FormField>
          {!companyId ? (
            <FormField label={t("activities.company")} required>
              <CompanySelect
                value={selectedCompanyId}
                onChange={(value) => {
                  setSelectedCompanyId(value);
                  setSelectedContactId(null);
                  setSelectedOpportunityId("");
                }}
              />
            </FormField>
          ) : null}
          <FormField label={t("activities.contact")}>
            <ContactSelect
              allowEmpty
              companyId={selectedCompanyId}
              value={selectedContactId}
              onChange={setSelectedContactId}
            />
          </FormField>
          <FormField label={t("activities.when")} htmlFor="activity-occurred" required>
            <DateTimePicker
              id="activity-occurred"
              includeTime
              value={occurredAt}
              onChange={setOccurredAt}
            />
          </FormField>
          <FormField label={t("activities.summary")} htmlFor="activity-summary" required>
            <Textarea
              id="activity-summary"
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
            />
          </FormField>
          <FormField label={t("activities.outcome")} htmlFor="activity-outcome">
            <Textarea
              id="activity-outcome"
              value={outcome}
              onChange={(event) => setOutcome(event.target.value)}
            />
          </FormField>
          {!activity ? <Can permission={PERMISSION_KEYS.TASKS_CREATE}>
            <label className="flex items-center gap-2 py-2 text-sm">
              <Checkbox
                checked={createFollowUp}
                onCheckedChange={(checked) => setCreateFollowUp(Boolean(checked))}
              />
              {t("activities.createNextAction")}
            </label>
            {createFollowUp ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label={t("activities.followUp")} htmlFor="follow-up-title" required>
                  <Input
                    id="follow-up-title"
                    value={followUpTitle}
                    onChange={(event) => setFollowUpTitle(event.target.value)}
                    placeholder={t("activities.followUpPlaceholder")}
                  />
                </FormField>
                <FormField label={t("activities.due")} htmlFor="follow-up-due" required>
                  <DateTimePicker
                    id="follow-up-due"
                    includeTime
                    value={followUpDue}
                    onChange={setFollowUpDue}
                  />
                </FormField>
              </div>
            ) : null}
          </Can> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" loading={mutation.isPending}>
              {t(activity ? "activities.saveEdit" : "activities.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
