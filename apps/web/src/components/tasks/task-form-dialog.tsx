"use client";

import type { CreateTaskInput, TaskRecord } from "@nbs/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { CompanySelect, ContactSelect, FormField, UserSelect } from "@/components/crm/selects";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
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

export function TaskFormDialog({
  open,
  onOpenChange,
  companyId,
  opportunityId,
  contactId,
  task,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId?: string;
  opportunityId?: string;
  contactId?: string;
  task?: TaskRecord | null;
}) {
  const { t } = useI18n();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [dueAt, setDueAt] = useState(task?.dueAt ?? "");
  const [ownerId, setOwnerId] = useState<string | null>(task?.owner.id ?? user?.id ?? null);
  const [selectedCompanyId, setSelectedCompanyId] = useState(task?.companyId ?? companyId ?? "");
  const [selectedContactId, setSelectedContactId] = useState<string | null>(
    task?.contactId ?? contactId ?? null,
  );

  const mutation = useMutation({
    mutationFn: (input: CreateTaskInput) => {
      if (task) {
        return api.patch<{ task: TaskRecord }>(`/tasks/${task.id}`, input);
      }
      return api.post<{ task: TaskRecord }>("/tasks", input);
    },
    onSuccess: async () => {
      toast.success(task ? t("toasts.followUpUpdated") : t("toasts.followUpCreated"));
      onOpenChange(false);
      await queryClient.invalidateQueries({ queryKey: ["tasks"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      await queryClient.invalidateQueries({ queryKey: ["companies"] });
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : t("tasks.saveFailed"));
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (next) {
          setTitle(task?.title ?? "");
          setDescription(task?.description ?? "");
          setDueAt(task?.dueAt ?? "");
          setOwnerId(task?.owner.id ?? user?.id ?? null);
          setSelectedCompanyId(task?.companyId ?? companyId ?? "");
          setSelectedContactId(task?.contactId ?? contactId ?? null);
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{task ? t("tasks.edit") : t("tasks.create")}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!ownerId || !dueAt) {
              return;
            }
            mutation.mutate({
              title,
              description,
              dueAt,
              ownerId,
              companyId: selectedCompanyId || null,
              contactId: selectedContactId,
              opportunityId: opportunityId ?? task?.opportunityId ?? null,
            });
          }}
        >
          <FormField label={t("tasks.titleField")} htmlFor="task-title" required>
            <Input id="task-title" value={title} onChange={(event) => setTitle(event.target.value)} />
          </FormField>
          <FormField label={t("tasks.due")} htmlFor="task-due" required>
            <DateTimePicker
              id="task-due"
              includeTime
              value={dueAt}
              onChange={setDueAt}
            />
          </FormField>
          <FormField label={t("tasks.owner")} required>
            <UserSelect value={ownerId} onChange={setOwnerId} />
          </FormField>
          {!companyId ? (
            <FormField label={t("tasks.company")}>
              <CompanySelect
                value={selectedCompanyId}
                onChange={(value) => {
                  setSelectedCompanyId(value);
                  setSelectedContactId(null);
                }}
              />
            </FormField>
          ) : null}
          <FormField label={t("tasks.contact")}>
            <ContactSelect
              allowEmpty
              companyId={selectedCompanyId}
              value={selectedContactId}
              onChange={setSelectedContactId}
            />
          </FormField>
          <FormField label={t("tasks.notes")} htmlFor="task-notes">
            <Textarea
              id="task-notes"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" loading={mutation.isPending}>
              {t("tasks.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
