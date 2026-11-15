"use client";
import type { SalesMarketRef } from "@nbs/shared";
import { useI18n } from "@/i18n/provider";
import { countryName, marketName } from "@/lib/market-management";

export function CompanyTerritory({ countryCode, salesMarketCode, markets }: { countryCode: string | null; salesMarketCode: string | null; markets: SalesMarketRef[] }) {
  const { t, locale } = useI18n();
  return <dl className="space-y-1 text-xs text-muted-foreground">
    <div className="flex flex-wrap gap-x-2"><dt>{t("companies.countryCode")}</dt><dd><bdi>{countryName(countryCode, locale, t("markets.unassigned"))}</bdi></dd></div>
    <div className="flex flex-wrap gap-x-2"><dt>{t("companies.salesMarket")}</dt><dd><bdi>{marketName(salesMarketCode, markets, locale, t("markets.unassigned"))}</bdi></dd></div>
  </dl>;
}
