import { countryCodeSchema, INITIAL_SALES_MARKETS, salesMarketCodeSchema } from "@nbs/shared";
import type { Prisma } from "../generated/prisma/client";
import { badRequest } from "../lib/errors";
import { prisma } from "../lib/prisma";

export async function listSalesMarkets() {
  return prisma.salesMarket.findMany({ orderBy: { name: "asc" } });
}

// Reuse at every write boundary, including import commit (preview is never trusted).
export async function validateCompanyTerritory(country: unknown, market: unknown) {
  const countryResult = countryCodeSchema.safeParse(country);
  const marketResult = salesMarketCodeSchema.safeParse(market);
  const fields: Record<string, string[]> = {};
  if (!countryResult.success) fields.countryCode = ["Country Code: a valid ISO alpha-2 code is required."];
  if (!marketResult.success) fields.salesMarketCode = ["Sales Market: a configured market code is required."];
  if (Object.keys(fields).length) throw badRequest("Country and sales market must be valid.", fields);
  const countryCode = countryResult.data!;
  const salesMarketCode = marketResult.data!;
  if (!await prisma.salesMarket.findUnique({ where: { code: salesMarketCode }, select: { code: true } })) {
    throw badRequest("Sales Market: unsupported market code or not assigned to your account.", { salesMarketCode: ["Sales Market: unsupported market code or not assigned to your account."] });
  }
  return { countryCode, salesMarketCode };
}

export async function provisionSalesMarkets(tx: Prisma.TransactionClient) {
  for (const market of INITIAL_SALES_MARKETS) {
    // Empty updates deliberately preserve existing market labels and future markets.
    await tx.salesMarket.upsert({ where: { code: market.code }, create: market, update: {} });
  }
}

export const legacyTerritoryWhere = {
  countryMarketLegacyCohort: true, countryCode: null, salesMarketCode: null,
} as const;

export async function backfillLegacyCompanyTerritories(tx: Prisma.TransactionClient) {
  if (!await tx.salesMarket.findUnique({ where: { code: "JO" } })) {
    throw badRequest("Provision the Jordan sales market before backfilling.");
  }
  // One conditional UPDATE: repeatable and safe against concurrent explicit assignments.
  return tx.company.updateMany({ where: legacyTerritoryWhere, data: { countryCode: "JO", salesMarketCode: "JO" } });
}
