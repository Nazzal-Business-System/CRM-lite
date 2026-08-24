"use client";

import {
  ACTIVITY_TYPES,
  PERMISSION_KEYS,
  type ActivityRecord,
  type CreateActivityInput,
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
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId?: string;
  opportunityId?: string;
  contactId?: string;
}) {
  const { t } = useI18n();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [type, setType] = useState("MEETING");
  const [selectedCompanyId, setSelectedCompanyId] = useState(companyId ?? "");
  const [selectedContactId, setSelectedContactId] = useState<string | null>(contactId ?? null);
  const [selectedOpportunityId, setSelectedOpportunityId] = useState(opportunityId ?? "");
  const [occurredAt, setOccurredAt] = useState(new Date().toISOString());
  const [summary, setSummary] = useState("");
  const [outcome, setOutcome] = useState("");
  const [createFollowUp, setCreateFollowUp] = useState(false);
  const [followUpTitle, setFollowUpTitle] = useState("");
  const [followUpDue, setFollowUpDue] = useState("");

  const mutation = useMutation({
    mutationFn: (input: CreateActivityInput) =>
      api.post<{ activity: ActivityRecord }>("/activities", input),
    onSuccess: async () => {
      toast.success(t("toasts.activityLogged"));
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
          setSelectedCompanyId(companyId ?? selectedCompanyId);
          setSelectedContactId(contactId ?? selectedContactId);
          setSelectedOpportunityId(opportunityId ?? selectedOpportunityId);
        }
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("activities.add")}</DialogTitle>
          <DialogDescription>{t("activities.formDescription")}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
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
                createFollowUp && followUpTitle && followUpDue
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
          <Can permission={PERMISSION_KEYS.TASKS_CREATE}>
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
          </Can>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" loading={mutation.isPending}>
              {t("activities.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
