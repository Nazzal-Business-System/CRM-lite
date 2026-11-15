import { z } from "zod";

// ISO 3166-1 alpha-2. Countries are independent of operational sales territories.
export const COUNTRY_CODES = "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW".split(" ");
const countries = new Set(COUNTRY_CODES);
export const countryCodeSchema = z.string().trim().toUpperCase().refine(
  (value) => countries.has(value), "Use an ISO 3166-1 alpha-2 country code (for example JO, GB or US).",
);
export const salesMarketCodeSchema = z.string().trim().toUpperCase().min(1, "Sales market is required.").max(32).regex(/^[A-Z][A-Z0-9_]*$/, "Use a sales market code.");
export const userMarketCodesSchema = z.array(salesMarketCodeSchema).max(100).refine((codes) => new Set(codes).size === codes.length, "Duplicate market codes are not allowed.");
export const replaceMarketMembershipsSchema = z.object({ marketCodes: userMarketCodesSchema, defaultMarketCode: salesMarketCodeSchema.nullable().optional() });
export type DisplayCurrency = "JOD" | "GBP" | "USD";
export function marketDisplayCurrency(code: string | null | undefined): DisplayCurrency | null {
  if (!code) return null;
  return code === "JO" ? "JOD" : code === "UK" ? "GBP" : "USD";
}
export interface UserMarketMembership { marketCode: string; assignedAt: string; assignedByUserId: string; market: SalesMarketRef }
export interface SalesMarketRef { code: string; name: string; nameAr: string }
export const INITIAL_SALES_MARKETS: readonly SalesMarketRef[] = [
  { code: "JO", name: "Jordan", nameAr: "الأردن" },
  { code: "UK", name: "UK", nameAr: "المملكة المتحدة" },
  { code: "US", name: "US", nameAr: "الولايات المتحدة" },
  { code: "OTHER", name: "Other", nameAr: "أخرى" },
];
