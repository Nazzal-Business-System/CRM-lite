"use client";

import {
  DECISION_ROLES,
  PREFERRED_CHANNELS,
  type ContactDetail,
  type CreateContactInput,
} from "@nbs/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { CompanySelect, EnumSelect, FormField } from "@/components/crm/selects";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/i18n/provider";
import { api, ApiError } from "@/lib/api";
import { cacheContact, refreshContactCollections } from "@/lib/contact-cache";

type ContactFormState = {
  companyId: string;
  name: string;
  jobTitle: string;
  decisionRole: (typeof DECISION_ROLES)[number];
  email: string;
  phone: string;
  linkedInUrl: string;
  preferredChannel: (typeof PREFERRED_CHANNELS)[number];
  notes: string;
  isPrimary: boolean;
};

const EMPTY_CONTACT_FORM: ContactFormState = {
  companyId: "",
  name: "",
  jobTitle: "",
  decisionRole: "UNKNOWN",
  email: "",
  phone: "",
  linkedInUrl: "",
  preferredChannel: "EMAIL",
  notes: "",
  isPrimary: false,
};

function contactFormValues(
  contact?: ContactDetail | null,
  companyId?: string,
): ContactFormState {
  if (!contact) {
    return { ...EMPTY_CONTACT_FORM, companyId: companyId ?? "" };
  }
  return {
    companyId: contact.companyId,
    name: contact.name,
    jobTitle: contact.jobTitle ?? "",
    decisionRole: contact.decisionRole,
    email: contact.email ?? "",
    phone: contact.phone ?? "",
    linkedInUrl: contact.linkedInUrl ?? "",
    preferredChannel: contact.preferredChannel,
    notes: contact.notes ?? "",
    isPrimary: contact.isPrimary,
  };
}

export function ContactFormDialog({
  open,
  onOpenChange,
  companyId,
  contact,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId?: string;
  contact?: ContactDetail | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? (
        <ContactFormContent
          companyId={companyId}
          contact={contact}
          onClose={() => onOpenChange(false)}
        />
      ) : null}
    </Dialog>
  );
}

function ContactFormContent({
  companyId,
  contact,
  onClose,
}: {
  companyId?: string;
  contact?: ContactDetail | null;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<ContactFormState>(() =>
    contactFormValues(contact, companyId),
  );

  const mutation = useMutation({
    mutationFn: (input: CreateContactInput) => {
      if (contact) {
        return api.patch<{ contact: ContactDetail }>(`/contacts/${contact.id}`, input);
      }
      return api.post<{ contact: ContactDetail }>("/contacts", input);
    },
    onSuccess: async (data) => {
      toast.success(contact ? t("toasts.contactUpdated") : t("toasts.contactCreated"));
      cacheContact(queryClient, data.contact);
      await refreshContactCollections(queryClient, [
        contact?.companyId,
        data.contact.companyId,
      ]);
      onClose();
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : t("contacts.saveFailed"));
    },
  });

  return (
    <DialogContent className="max-h-[calc(100dvh-1.5rem)] max-w-2xl gap-3 overflow-y-auto p-4 sm:p-5 [@media(min-width:640px)_and_(min-height:600px)]:overflow-y-visible">
        <DialogHeader>
          <DialogTitle>{contact ? t("contacts.edit") : t("contacts.add")}</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-x-4 gap-y-2 sm:grid-cols-2 [&_.space-y-2]:space-y-1"
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate({
              ...form,
              email: form.email || null,
              jobTitle: form.jobTitle || null,
              linkedInUrl: form.linkedInUrl || null,
              notes: form.notes || null,
              phone: form.phone || null,
            });
          }}
        >
          {!companyId ? (
            <div className="sm:col-span-2">
              <FormField label={t("contacts.company")} required>
                <CompanySelect
                  value={form.companyId}
                  onChange={(value) => setForm({ ...form, companyId: value })}
                />
              </FormField>
            </div>
          ) : null}
          <FormField label={t("contacts.name")} htmlFor="contact-name" required>
            <Input
              id="contact-name"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
          </FormField>
          <FormField label={t("contacts.jobTitle")} htmlFor="contact-title" optional>
            <Input
              id="contact-title"
              value={form.jobTitle}
              onChange={(event) => setForm({ ...form, jobTitle: event.target.value })}
            />
          </FormField>
          <FormField label={t("contacts.decisionRole")}>
            <EnumSelect
              value={form.decisionRole}
              onChange={(value) => setForm({ ...form, decisionRole: value || "UNKNOWN" })}
              options={DECISION_ROLES.map((value) => ({
                value,
                label: t(`enums.decisionRole.${value}`),
              }))}
            />
          </FormField>
          <FormField label={t("contacts.preferredChannel")}>
            <EnumSelect
              value={form.preferredChannel}
              onChange={(value) => setForm({ ...form, preferredChannel: value || "EMAIL" })}
              options={PREFERRED_CHANNELS.map((value) => ({
                value,
                label: t(`enums.preferredChannel.${value}`),
              }))}
            />
          </FormField>
          <FormField label={t("contacts.email")} htmlFor="contact-email">
            <Input
              id="contact-email"
              type="email"
              dir="ltr"
              value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
            />
          </FormField>
          <FormField label={t("contacts.phone")} htmlFor="contact-phone">
            <Input
              id="contact-phone"
              dir="ltr"
              value={form.phone}
              onChange={(event) => setForm({ ...form, phone: event.target.value })}
            />
          </FormField>
          <div className="sm:col-span-2">
            <FormField label={t("contacts.linkedIn")} htmlFor="contact-linkedin">
              <Input
                id="contact-linkedin"
                dir="ltr"
                value={form.linkedInUrl}
                onChange={(event) => setForm({ ...form, linkedInUrl: event.target.value })}
              />
            </FormField>
          </div>
          <div className="sm:col-span-2">
            <FormField label={t("contacts.notes")} htmlFor="contact-notes">
              <Textarea
                id="contact-notes"
                className="min-h-16 resize-y"
                value={form.notes}
                onChange={(event) => setForm({ ...form, notes: event.target.value })}
              />
            </FormField>
          </div>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <Checkbox
              checked={form.isPrimary}
              onCheckedChange={(checked) => setForm({ ...form, isPrimary: Boolean(checked) })}
            />
            {t("contacts.primaryContact")}
          </label>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" loading={mutation.isPending}>
              {t("contacts.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
  );
}
