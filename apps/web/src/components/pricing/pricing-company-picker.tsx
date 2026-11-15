"use client";
import type { AuthUser } from "@nbs/shared";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { EnumSelect } from "@/components/crm/selects";
import { Input } from "@/components/ui/input";
import { useDebouncedValue } from "@/lib/query";
import { canLinkPricing, pricingActorKey, pricingCompanyOptions } from "@/lib/pricing";
import { api } from "@/lib/api";
import { useI18n } from "@/i18n/provider";
import { PricingError } from "./pricing-shared";

export function PricingCompanyPicker({ user, value, onChange, disabled = false }: { user: AuthUser | null; value: string; onChange: (id: string) => void; disabled?: boolean }) {
  const { t, dir } = useI18n(); const [search, setSearch] = useState(""); const debounced = useDebouncedValue(search);
  const query = useQuery(pricingCompanyOptions(user, debounced));
  const selected = useQuery({ queryKey: ["pricing", "selected-company", ...pricingActorKey(user), value], enabled: canLinkPricing(user) && !!value, retry: false, refetchOnWindowFocus: true,
    queryFn: () => api.get<{ company: { id: string; name: string } }>(`/companies/${encodeURIComponent(value)}`),
  });
  if (!canLinkPricing(user)) return <p role="alert">{t("pricing.noCompanyPermission")}</p>;
  const companies = query.isError ? [] : [...(query.data?.companies ?? [])];
  if (!selected.isError && selected.data && !companies.some(item => item.id === value)) companies.unshift(selected.data.company);
  return <div className="min-w-0 space-y-2">
    <Input aria-label={t("pricing.companySearch")} placeholder={t("pricing.companySearch")} value={search} onChange={event => setSearch(event.target.value)} disabled={disabled} />
    {query.isError ? <PricingError error={query.error} retry={() => { void query.refetch(); }} /> : <>
      <label htmlFor="pricing-company" className="sr-only">{t("pricing.company")}</label><EnumSelect id="pricing-company" dir={dir} value={value} allowEmpty emptyLabel={t("common.selectCompany")} disabled={disabled || query.isPending} onChange={onChange} options={companies.map(company => ({ value: company.id, label: company.name }))} />
      {!query.isFetching && !companies.length && <p role="status" className="text-xs text-muted-foreground">{t("pricing.noCompanies")}</p>}
    </>}
    {selected.isError && <PricingError error={selected.error} retry={() => { void selected.refetch(); }} />}
    <p className="text-xs text-muted-foreground">{t("pricing.companyHint")}</p>
  </div>;
}
