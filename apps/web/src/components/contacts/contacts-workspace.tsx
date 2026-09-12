"use client";

import {
  DECISION_ROLES,
  PERMISSION_KEYS,
  type ContactDetail,
  type ContactSummary,
  type PaginatedResult,
} from "@nbs/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Contact, LoaderCircle, Plus } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ContactFormDialog } from "@/components/contacts/contact-form-dialog";
import {
  CardListSkeleton,
  DataToolbar,
  DetailSkeleton,
  EmptyState,
  Fact,
  PageFrame,
  PageHeader,
  PaginationBar,
  QueryPanel,
  Surface,
  ToolbarFilter,
  ToolbarSearch,
} from "@/components/crm/primitives";
import { CompanySelect, EnumSelect } from "@/components/crm/selects";
import { Can } from "@/components/permission-gate";
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
import { useI18n } from "@/i18n/provider";
import { api, ApiError } from "@/lib/api";
import {
  removeContactFromCache,
  refreshContactCollections,
} from "@/lib/contact-cache";
import { navigateTo } from "@/lib/navigate";
import { toQuery, useDebouncedValue } from "@/lib/query";
import { sortParams, type SortSelection } from "@/lib/sorting";

function ContactDeleteDialog({
  contact,
  onOpenChange,
  onDeleted,
}: {
  contact: ContactSummary | ContactDetail | null;
  onOpenChange: (open: boolean) => void;
  onDeleted?: () => void;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (target: ContactSummary | ContactDetail) =>
      api.delete(`/contacts/${target.id}`),
    onSuccess: async (_data, deleted) => {
      removeContactFromCache(queryClient, deleted.id);
      await refreshContactCollections(queryClient, [deleted.companyId]);
      toast.success(t("toasts.contactDeleted"));
      onOpenChange(false);
      onDeleted?.();
    },
    onError: (error) => {
      toast.error(
        error instanceof ApiError ? error.message : t("contacts.deleteFailed"),
      );
    },
  });

  return (
    <AlertDialog
      open={Boolean(contact)}
      onOpenChange={(next) => {
        if (!mutation.isPending) onOpenChange(next);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("contacts.deleteTitle", { name: contact?.name ?? "" })}
          </AlertDialogTitle>
          <AlertDialogDescription>{t("contacts.deleteBody")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={mutation.isPending}>
            {t("common.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={mutation.isPending || !contact}
            onClick={(event) => {
              event.preventDefault();
              if (contact) mutation.mutate(contact);
            }}
          >
            {mutation.isPending ? (
              <>
                <LoaderCircle className="size-4 animate-spin" aria-hidden />
                {t("common.deleting")}
              </>
            ) : (
              t("common.delete")
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function validExternalUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

export function ContactsWorkspace() {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [role, setRole] = useState("");
  const [sort, setSort] = useState<SortSelection>("updatedAt:desc");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<ContactDetail | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ContactSummary | null>(null);
  const debounced = useDebouncedValue(search);

  const query = useQuery({
    queryKey: ["contacts", debounced, companyId, role, sort, page],
    queryFn: () =>
      api.get<PaginatedResult<ContactSummary>>(
        `/contacts${toQuery({
          search: debounced,
          companyId,
          decisionRole: role,
          ...sortParams(sort),
          page,
          pageSize: 20,
        })}`,
      ),
  });

  async function openEdit(contactId: string) {
    try {
      const data = await queryClient.fetchQuery({
        queryKey: ["contact", contactId],
        queryFn: () =>
          api.get<{ contact: ContactDetail }>(`/contacts/${contactId}`),
        staleTime: 0,
      });
      setEditingContact(data.contact);
      setEditOpen(true);
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : t("contacts.openEditFailed"),
      );
    }
  }

  return (
    <PageFrame width="wide">
      <PageHeader
        title={t("contacts.title")}
        description={t("contacts.description")}
        count={query.data?.total}
        actions={
          <Can permission={PERMISSION_KEYS.CONTACTS_CREATE}>
            <Button onClick={() => setOpen(true)}>
              <Plus className="size-4" />
              {t("contacts.add")}
            </Button>
          </Can>
        }
      />
      <DataToolbar>
        <ToolbarSearch
          value={search}
          onChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
          placeholder={t("contacts.search")}
        />
        <ToolbarFilter className="sm:min-w-56" label={t("contacts.company")}>
          <CompanySelect
            allowEmpty
            emptyLabel={t("common.allCompanies")}
            value={companyId}
            onChange={(value) => {
              setCompanyId(value);
              setPage(1);
            }}
          />
        </ToolbarFilter>
        <ToolbarFilter className="sm:min-w-60" label={t("filters.sort")}>
          <EnumSelect
            value={sort}
            onChange={(value) => { setSort(value as SortSelection); setPage(1); }}
            options={[
              { value: "updatedAt:desc", label: t("sort.recentlyUpdated") },
              { value: "createdAt:desc", label: t("sort.recentlyAdded") },
              { value: "name:asc", label: t("sort.nameAsc") },
              { value: "name:desc", label: t("sort.nameDesc") },
              { value: "companyName:asc", label: t("sort.companyAsc") },
              { value: "companyName:desc", label: t("sort.companyDesc") },
            ]}
          />
        </ToolbarFilter>
        <ToolbarFilter className="sm:min-w-52" label={t("contacts.decisionRole")}>
          <EnumSelect
            allowEmpty
            value={role}
            onChange={(value) => {
              setRole(value);
              setPage(1);
            }}
            options={DECISION_ROLES.map((value) => ({
              value,
              label: t(`enums.decisionRole.${value}`),
            }))}
            emptyLabel={t("filters.anyRole")}
            placeholder={t("filters.anyRole")}
          />
        </ToolbarFilter>
      </DataToolbar>
      <QueryPanel
        query={query}
        skeleton={<CardListSkeleton />}
        errorMessage={t("contacts.loadFailed")}
        isEmpty={(data) => data.items.length === 0}
        empty={
          <EmptyState
            icon={Contact}
            title={t("contacts.empty")}
            description={t("contacts.emptyHint")}
          />
        }
      >
        {(data) => (
          <>
            <div className="space-y-2">
              {data.items.map((contact) => (
                <div
                  key={contact.id}
                  className="flex flex-col gap-3 rounded-xl border border-border/80 bg-card px-4 py-3.5 sm:flex-row sm:items-center"
                >
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 cursor-pointer items-center justify-between gap-3 text-start"
                    onClick={() => navigateTo(router, `/contacts/${contact.id}`, pathname)}
                  >
                    <div className="min-w-0">
                      <p className="font-medium">{contact.name}</p>
                      <p className="truncate text-sm text-muted-foreground">
                        {contact.companyName} · {contact.jobTitle || t("common.noTitle")} ·{" "}
                        {t(`enums.decisionRole.${contact.decisionRole}`)}
                      </p>
                    </div>
                    {contact.isPrimary ? <Badge>{t("common.primary")}</Badge> : null}
                  </button>
                  <div className="flex shrink-0 self-end gap-1.5 sm:self-auto">
                    <Can permission={PERMISSION_KEYS.CONTACTS_UPDATE}>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => void openEdit(contact.id)}
                      >
                        {t("common.edit")}
                      </Button>
                    </Can>
                    <Can permission={PERMISSION_KEYS.CONTACTS_DELETE}>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setDeleteTarget(contact)}
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
      <ContactFormDialog open={open} onOpenChange={setOpen} />
      <ContactFormDialog
        key={editingContact?.id ?? "edit-contact-closed"}
        open={editOpen}
        onOpenChange={(next) => {
          setEditOpen(next);
          if (!next) setEditingContact(null);
        }}
        contact={editingContact}
      />
      <ContactDeleteDialog
        contact={deleteTarget}
        onOpenChange={(next) => {
          if (!next) setDeleteTarget(null);
        }}
      />
    </PageFrame>
  );
}

export function ContactDetailView({ id }: { id: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const query = useQuery({
    queryKey: ["contact", id],
    queryFn: () => api.get<{ contact: ContactDetail }>(`/contacts/${id}`),
  });

  return (
    <PageFrame>
      <QueryPanel
        query={query}
        skeleton={<DetailSkeleton />}
        errorMessage={t("contacts.detailLoadFailed")}
      >
        {(data) => {
          const contact = data.contact;
          const linkedInUrl = validExternalUrl(contact.linkedInUrl);
          return (
            <div className="space-y-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-[1.65rem] font-semibold tracking-[-0.03em]">
                      {contact.name}
                    </h2>
                    {contact.isPrimary ? <Badge>{t("common.primary")}</Badge> : null}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {contact.jobTitle || t("common.noTitle")} ·{" "}
                    {t(`enums.decisionRole.${contact.decisionRole}`)}
                  </p>
                  <button
                    type="button"
                    className="cursor-pointer text-sm text-primary"
                    onClick={() => navigateTo(router, `/companies/${contact.companyId}`, pathname)}
                  >
                    {contact.companyName}
                  </button>
                </div>
                <div className="flex gap-2">
                  <Can permission={PERMISSION_KEYS.CONTACTS_UPDATE}>
                    <Button onClick={() => setOpen(true)}>{t("common.edit")}</Button>
                  </Can>
                  <Can permission={PERMISSION_KEYS.CONTACTS_DELETE}>
                    <Button variant="outline" onClick={() => setDeleteOpen(true)}>
                      {t("common.delete")}
                    </Button>
                  </Can>
                </div>
              </div>
              <Surface className="grid gap-4 p-5 sm:grid-cols-2">
                <Fact
                  label={t("contacts.email")}
                  value={
                    contact.email ? (
                      <span dir="ltr">{contact.email}</span>
                    ) : (
                      t("common.dash")
                    )
                  }
                />
                <Fact
                  label={t("contacts.phone")}
                  value={
                    contact.phone ? (
                      <span dir="ltr">{contact.phone}</span>
                    ) : (
                      t("common.dash")
                    )
                  }
                />
                <Fact
                  label={t("contacts.channel")}
                  value={t(`enums.preferredChannel.${contact.preferredChannel}`)}
                />
                <Fact
                  label={t("contacts.linkedIn")}
                  value={
                    linkedInUrl ? (
                      <a
                        href={linkedInUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        dir="ltr"
                        className="break-all text-primary hover:underline"
                      >
                        {contact.linkedInUrl}
                      </a>
                    ) : contact.linkedInUrl ? (
                      <span dir="ltr" className="break-all">
                        {contact.linkedInUrl}
                      </span>
                    ) : (
                      t("common.dash")
                    )
                  }
                />
              </Surface>
              <Surface className="p-5">
                <h3 className="text-sm font-medium">{t("contacts.notes")}</h3>
                <p
                  className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground"
                  dir={contact.notes ? "auto" : undefined}
                >
                  {contact.notes || t("common.dash")}
                </p>
              </Surface>
              <ContactFormDialog open={open} onOpenChange={setOpen} contact={contact} />
              <ContactDeleteDialog
                contact={deleteOpen ? contact : null}
                onOpenChange={setDeleteOpen}
                onDeleted={() => navigateTo(router, "/contacts", pathname)}
              />
            </div>
          );
        }}
      </QueryPanel>
    </PageFrame>
  );
}
