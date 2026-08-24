"use client";

import {
  DECISION_ROLES,
  PERMISSION_KEYS,
  type ContactDetail,
  type ContactSummary,
  type PaginatedResult,
} from "@nbs/shared";
import { useQuery } from "@tanstack/react-query";
import { Contact, Plus } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
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
import { useI18n } from "@/i18n/provider";
import { api } from "@/lib/api";
import { navigateTo } from "@/lib/navigate";
import { toQuery, useDebouncedValue } from "@/lib/query";

export function ContactsWorkspace() {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const [search, setSearch] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [role, setRole] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const debounced = useDebouncedValue(search);

  const query = useQuery({
    queryKey: ["contacts", debounced, companyId, role, page],
    queryFn: () =>
      api.get<PaginatedResult<ContactSummary>>(
        `/contacts${toQuery({
          search: debounced,
          companyId,
          decisionRole: role,
          page,
          pageSize: 20,
        })}`,
      ),
  });

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
                <button
                  key={contact.id}
                  type="button"
                  className="flex w-full cursor-pointer items-center justify-between rounded-xl border border-border/80 bg-card px-4 py-3.5 text-left"
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
    </PageFrame>
  );
}

export function ContactDetailView({ id }: { id: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
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
                <Can permission={PERMISSION_KEYS.CONTACTS_UPDATE}>
                  <Button onClick={() => setOpen(true)}>{t("common.edit")}</Button>
                </Can>
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
                    contact.linkedInUrl ? (
                      <span dir="ltr">{contact.linkedInUrl}</span>
                    ) : (
                      t("common.dash")
                    )
                  }
                />
              </Surface>
              {contact.notes ? (
                <Surface className="p-5">
                  <p className="text-[13px] text-muted-foreground">{t("contacts.notes")}</p>
                  <p className="mt-2 text-sm leading-6">{contact.notes}</p>
                </Surface>
              ) : null}
              <ContactFormDialog open={open} onOpenChange={setOpen} contact={contact} />
            </div>
          );
        }}
      </QueryPanel>
    </PageFrame>
  );
}
