"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronsUpDown, LoaderCircle, Search } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { toQuery, useDebouncedValue } from "@/lib/query";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const NONE = "__none__";

export function EnumSelect<T extends string>({
  value,
  onChange,
  options,
  placeholder,
  allowEmpty,
  emptyLabel,
  id,
}: {
  value: T | "" | null | undefined;
  onChange: (value: T | "") => void;
  options: Array<{ value: T; label: string }>;
  placeholder?: string;
  allowEmpty?: boolean;
  emptyLabel?: string;
  id?: string;
}) {
  const { t } = useI18n();
  const resolvedEmptyLabel = emptyLabel ?? t("common.any");

  return (
    <Select
      value={value || (allowEmpty ? NONE : undefined)}
      onValueChange={(next) => onChange(next === NONE ? "" : (next as T))}
    >
      <SelectTrigger id={id}>
        <SelectValue placeholder={placeholder ?? resolvedEmptyLabel} />
      </SelectTrigger>
      <SelectContent>
        {allowEmpty ? <SelectItem value={NONE}>{resolvedEmptyLabel}</SelectItem> : null}
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function SearchablePicker({
  value,
  label,
  placeholder,
  searchPlaceholder,
  disabled,
  options,
  loading,
  onSearch,
  onChange,
}: {
  value: string;
  label?: string;
  placeholder: string;
  searchPlaceholder: string;
  disabled?: boolean;
  loading?: boolean;
  options: Array<{ value: string; label: string }>;
  onSearch: (value: string) => void;
  onChange: (value: string) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    onSearch(search);
  }, [onSearch, search]);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setSearch("");
          onSearch("");
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            "h-9 w-full justify-between px-3 font-normal",
            !label && "text-muted-foreground",
          )}
        >
          <span className={cn("truncate", label && "text-foreground")}>
            {label || placeholder}
          </span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-0"
        align="start"
        sideOffset={4}
        collisionPadding={12}
      >
        <div className="relative border-b border-border">
          <Search className="pointer-events-none absolute top-1/2 start-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          {loading ? (
            <LoaderCircle className="pointer-events-none absolute top-1/2 end-2.5 size-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
          ) : null}
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={searchPlaceholder}
            className="h-9 rounded-none border-0 ps-8 pe-8 shadow-none focus-visible:ring-0"
            autoFocus
          />
        </div>
        <div className="max-h-56 overflow-y-auto p-1">
          {options.length === 0 ? (
            <p className="px-2 py-2 text-sm text-muted-foreground">
              {loading ? t("common.searching") : t("common.noMatches")}
            </p>
          ) : (
            options.map((option) => (
              <button
                key={option.value}
                type="button"
                className={cn(
                  "flex w-full cursor-pointer rounded-sm px-2 py-1.5 text-start text-sm hover:bg-accent",
                  option.value === value && "bg-accent",
                )}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                  setSearch("");
                }}
              >
                {option.label}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function UserSelect({
  value,
  onChange,
  allowEmpty,
  emptyLabel,
}: {
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  allowEmpty?: boolean;
  emptyLabel?: string;
}) {
  const { t } = useI18n();
  const resolvedEmptyLabel = emptyLabel ?? t("common.unassigned");
  const [search, setSearch] = useState("");
  const query = useQuery({
    queryKey: ["user-options"],
    queryFn: () =>
      api.get<{ users: Array<{ id: string; name: string; email: string }> }>(
        "/users/options",
      ),
  });

  const options = useMemo(() => {
    const users = query.data?.users ?? [];
    const filtered = search
      ? users.filter((user) =>
          `${user.name} ${user.email}`.toLowerCase().includes(search.toLowerCase()),
        )
      : users;
    const items = filtered.map((user) => ({ value: user.id, label: user.name }));
    return allowEmpty ? [{ value: NONE, label: resolvedEmptyLabel }, ...items] : items;
  }, [allowEmpty, resolvedEmptyLabel, query.data?.users, search]);

  const selected = query.data?.users.find((user) => user.id === value);

  return (
    <SearchablePicker
      value={value || (allowEmpty ? NONE : "")}
      label={selected?.name ?? (value ? undefined : allowEmpty ? resolvedEmptyLabel : undefined)}
      placeholder={t("common.selectOwner")}
      searchPlaceholder={t("common.searchPeople")}
      options={options}
      loading={query.isFetching && !query.data}
      onSearch={setSearch}
      onChange={(next) => onChange(next === NONE ? null : next)}
    />
  );
}

export function CompanySelect({
  value,
  onChange,
  disabled,
  allowEmpty,
  emptyLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  allowEmpty?: boolean;
  emptyLabel?: string;
}) {
  const { t } = useI18n();
  const resolvedEmptyLabel = emptyLabel ?? t("common.allCompanies");
  const [search, setSearch] = useState("");
  const debounced = useDebouncedValue(search, 250);
  const query = useQuery({
    queryKey: ["company-options", debounced],
    queryFn: () =>
      api.get<{ companies: Array<{ id: string; name: string }> }>(
        `/companies/options${toQuery({ search: debounced })}`,
      ),
    placeholderData: (previous) => previous,
  });

  const selectedQuery = useQuery({
    queryKey: ["company-option", value],
    queryFn: () =>
      api.get<{ companies: Array<{ id: string; name: string }> }>(
        `/companies/options${toQuery({ search: "" })}`,
      ),
    enabled: Boolean(value) && !(query.data?.companies ?? []).some((c) => c.id === value),
    staleTime: 60_000,
  });

  const companies = useMemo(
    () => query.data?.companies ?? [],
    [query.data?.companies],
  );
  const options = useMemo(() => {
    const items = companies.map((company) => ({
      value: company.id,
      label: company.name,
    }));
    return allowEmpty ? [{ value: NONE, label: resolvedEmptyLabel }, ...items] : items;
  }, [allowEmpty, resolvedEmptyLabel, companies]);

  const selectedName =
    companies.find((company) => company.id === value)?.name ??
    selectedQuery.data?.companies.find((company) => company.id === value)?.name;

  return (
    <SearchablePicker
      value={value || (allowEmpty ? NONE : "")}
      label={
        selectedName ??
        (value ? undefined : allowEmpty ? resolvedEmptyLabel : undefined)
      }
      placeholder={t("common.selectCompany")}
      searchPlaceholder={t("common.searchCompanies")}
      disabled={disabled}
      loading={query.isFetching}
      options={options}
      onSearch={setSearch}
      onChange={(next) => onChange(next === NONE ? "" : next)}
    />
  );
}

export function ContactSelect({
  companyId,
  value,
  onChange,
  allowEmpty,
}: {
  companyId?: string;
  value: string | null;
  onChange: (value: string | null) => void;
  allowEmpty?: boolean;
}) {
  const { t } = useI18n();
  const noneLabel = t("common.none");
  const selectCompanyFirst = t("common.selectCompanyFirst");
  const [search, setSearch] = useState("");
  const query = useQuery({
    queryKey: ["contact-options", companyId],
    queryFn: () =>
      api.get<{
        contacts: Array<{ id: string; name: string; jobTitle: string | null }>;
      }>(`/contacts/options${toQuery({ companyId })}`),
    enabled: Boolean(companyId),
  });

  const options = useMemo(() => {
    const contacts = query.data?.contacts ?? [];
    const filtered = search
      ? contacts.filter((contact) =>
          `${contact.name} ${contact.jobTitle ?? ""}`
            .toLowerCase()
            .includes(search.toLowerCase()),
        )
      : contacts;
    const items = filtered.map((contact) => ({
      value: contact.id,
      label: contact.jobTitle ? `${contact.name} · ${contact.jobTitle}` : contact.name,
    }));
    return allowEmpty ? [{ value: NONE, label: noneLabel }, ...items] : items;
  }, [allowEmpty, noneLabel, query.data?.contacts, search]);

  const selected = query.data?.contacts.find((contact) => contact.id === value);

  return (
    <SearchablePicker
      value={value || (allowEmpty ? NONE : "")}
      label={
        selected
          ? selected.jobTitle
            ? `${selected.name} · ${selected.jobTitle}`
            : selected.name
          : !companyId
            ? selectCompanyFirst
            : allowEmpty
              ? noneLabel
              : undefined
      }
      placeholder={companyId ? t("common.selectContact") : selectCompanyFirst}
      searchPlaceholder={t("common.searchContacts")}
      disabled={!companyId}
      loading={query.isFetching && Boolean(companyId)}
      options={options}
      onSearch={setSearch}
      onChange={(next) => onChange(next === NONE ? null : next)}
    />
  );
}

export function FormField({
  label,
  htmlFor,
  children,
  error,
  required,
  optional,
  className,
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
  error?: string;
  required?: boolean;
  optional?: boolean;
  className?: string;
}) {
  const { t } = useI18n();

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={htmlFor}>
          {label}
          {required ? (
            <>
              <span className="ms-0.5 text-destructive" aria-hidden="true">
                *
              </span>
              <span className="sr-only"> ({t("common.required")})</span>
            </>
          ) : null}
        </Label>
        {optional && !required ? (
          <span className="text-[11px] text-muted-foreground">{t("common.optional")}</span>
        ) : null}
      </div>
      {children}
      {error ? <p className="text-[13px] text-destructive">{error}</p> : null}
    </div>
  );
}

export function RequiredLabel({
  htmlFor,
  children,
  required = false,
}: {
  htmlFor?: string;
  children: ReactNode;
  required?: boolean;
}) {
  const { t } = useI18n();
  return (
    <Label htmlFor={htmlFor}>
      {children}
      {required ? (
        <>
          <span className="ms-0.5 text-destructive" aria-hidden="true">
            *
          </span>
          <span className="sr-only"> ({t("common.required")})</span>
        </>
      ) : null}
    </Label>
  );
}
