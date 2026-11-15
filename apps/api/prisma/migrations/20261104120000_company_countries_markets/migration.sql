-- Expansion only. Apply during a coordinated write pause before deploying the new API.
-- The transaction retains the ALTER TABLE lock until the cohort default becomes false.
BEGIN;
CREATE TABLE "sales_markets" (
  "code" VARCHAR(32) NOT NULL,
  "name" TEXT NOT NULL,
  "nameAr" TEXT NOT NULL,
  CONSTRAINT "sales_markets_pkey" PRIMARY KEY ("code")
);
ALTER TABLE "companies"
  ADD COLUMN "countryCode" VARCHAR(2),
  ADD COLUMN "salesMarketCode" VARCHAR(32),
  ADD COLUMN "countryMarketLegacyCohort" BOOLEAN NOT NULL DEFAULT true;
-- Only rows present at this migration's table lock are legacy; never use createdAt or NULL alone.
ALTER TABLE "companies" ALTER COLUMN "countryMarketLegacyCohort" SET DEFAULT false;
ALTER TABLE "companies" ADD CONSTRAINT "companies_salesMarketCode_fkey"
  FOREIGN KEY ("salesMarketCode") REFERENCES "sales_markets"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
-- Transitional legacy NULLs are allowed; future records must explicitly supply both fields.
ALTER TABLE "companies" ADD CONSTRAINT "companies_country_market_required"
  CHECK ("countryMarketLegacyCohort" OR ("countryCode" IS NOT NULL AND "salesMarketCode" IS NOT NULL));
ALTER TABLE "companies" ADD CONSTRAINT "companies_country_code_format"
  CHECK ("countryCode" IS NULL OR "countryCode" ~ '^[A-Z]{2}$');
CREATE INDEX "companies_countryCode_idx" ON "companies"("countryCode");
CREATE INDEX "companies_salesMarketCode_idx" ON "companies"("salesMarketCode");
COMMIT;
