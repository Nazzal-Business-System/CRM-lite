import "../src/load-env";
import { withMarketMaintenance } from "../src/lib/market-context";
import { createHash } from "node:crypto";
import { INITIAL_SALES_MARKETS } from "@nbs/shared";
import { env } from "../src/env";
import { prisma } from "../src/lib/prisma";
import { backfillLegacyCompanyTerritories, legacyTerritoryWhere, provisionSalesMarkets } from "../src/services/markets.service";

const args = process.argv.slice(2);
const backfill = args[0] === "--backfill";
if (backfill) args.shift();
const check = args.length === 0 || (args.length === 1 && args[0] === "--check");
const apply = args.length === 2 && args[0] === "--apply" && args[1]?.startsWith("--confirm-target=");
const database = new URL(env.DATABASE_URL);
const fingerprint = (url: URL) => createHash("sha256").update(url.hostname + url.pathname).digest("hex").slice(0, 12);
const target = fingerprint(database);
const targetSummary = { database: database.pathname.slice(1), targetFingerprint: target, migrationTargetFingerprint: fingerprint(new URL(process.env.DIRECT_URL || env.DATABASE_URL)) };
try {
  if (args.length === 1 && args[0] === "--target") {
    console.log(JSON.stringify({ mode: "target inspection (no database calls)", ...targetSummary }, null, 2));
  } else {
  if (!check && !apply) throw new Error("Invalid arguments");
  if (apply && args[1] !== `--confirm-target=${target}`) throw new Error("Target mismatch");
  const result = await withMarketMaintenance(() => prisma.$transaction(async (tx) => {
    if (check) await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    const markets = await tx.salesMarket.findMany({ select: { code: true } });
    const existing = new Set(markets.map((market) => market.code));
    const eligible = await tx.company.count({ where: legacyTerritoryWhere });
    const partialLegacy = await tx.company.count({ where: {
      countryMarketLegacyCohort: true,
      OR: [{ countryCode: null, salesMarketCode: { not: null } }, { countryCode: { not: null }, salesMarketCode: null }],
    } });
    if (apply) {
      if (backfill) return { updatedCompanies: (await backfillLegacyCompanyTerritories(tx)).count, partialLegacyRequiresReview: partialLegacy };
      await provisionSalesMarkets(tx);
    }
    return {
      missingMarkets: INITIAL_SALES_MARKETS.filter((market) => !existing.has(market.code)),
      eligibleLegacyCompanies: eligible, partialLegacyRequiresReview: partialLegacy,
      proposedCompanyAssignment: backfill ? { countryCode: "JO", salesMarketCode: "JO" } : null,
    };
  }));
  console.log(JSON.stringify({ mode: check ? "check (read-only)" : "apply", operation: backfill ? "legacy backfill" : "market provisioning", database: database.pathname.slice(1), targetFingerprint: target, migrationTargetFingerprint: fingerprint(new URL(process.env.DIRECT_URL || env.DATABASE_URL)), ...result }, null, 2));
  }
} catch {
  console.error("Territory provisioning did not complete. Verify arguments, target, connectivity and applied schema. No partial operation is committed. No credentials are printed.");
  process.exitCode = 1;
} finally { await prisma.$disconnect(); }
