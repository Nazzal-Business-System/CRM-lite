-- PREPARATION ONLY. No grants, preferences, historical updates or seed records.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
CREATE TYPE "PriceBookCode" AS ENUM ('JO','US','UK');
CREATE TABLE "user_price_book_grants" (
 "userId" TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "bookId" "PriceBookCode" NOT NULL,
 "assignedByUserId" TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY ("userId","bookId")
);
CREATE INDEX "user_price_book_grants_bookId_userId_idx" ON "user_price_book_grants"("bookId","userId");
CREATE TABLE "user_pricing_preferences" (
 "userId" TEXT PRIMARY KEY REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "defaultBookId" "PriceBookCode",
 CONSTRAINT "user_pricing_preferences_default_grant_fkey" FOREIGN KEY ("userId","defaultBookId") REFERENCES user_price_book_grants("userId","bookId") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE TABLE "pricing_estimate_books" (
 "estimateId" TEXT PRIMARY KEY REFERENCES pricing_estimates(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 "bookId" "PriceBookCode" NOT NULL,
 "bookVersion" VARCHAR(80) NOT NULL CHECK (length("bookVersion")>0),
 "structureVersion" VARCHAR(80) NOT NULL CHECK (length("structureVersion")>0)
);
CREATE INDEX "pricing_estimate_books_bookId_estimateId_idx" ON "pricing_estimate_books"("bookId","estimateId");
-- Preserve legacy JOD/FX rows; native rows use their book's currency. No UPDATE is needed.
ALTER TABLE pricing_estimates DROP CONSTRAINT pricing_estimates_fields_check;
ALTER TABLE pricing_estimates ADD CONSTRAINT pricing_estimates_fields_check CHECK (COALESCE((
 length(trim(title))>0 AND length(notes)<=4000 AND "configurationVersion">0 AND length("catalogVersion")>0 AND length("calculationVersion")>0 AND
 CASE WHEN result->>'pricingBasis' IS NULL THEN currency='JOD'
 ELSE result->>'pricingBasis'='PRICE_BOOK' AND currency=CASE result->'priceBook'->>'id' WHEN 'JO' THEN 'JOD' WHEN 'US' THEN 'USD' WHEN 'UK' THEN 'GBP' ELSE '' END
 AND (result->'priceBook'->>'version') IS NOT DISTINCT FROM "catalogVersion"
 AND length(COALESCE(result->'priceBook'->>'structureVersion',''))>0 END),false));
CREATE FUNCTION validate_pricing_estimate_book() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE snapshot jsonb;
BEGIN
 SELECT result INTO snapshot FROM pricing_estimates WHERE id=NEW."estimateId";
 IF (snapshot->>'pricingBasis') IS DISTINCT FROM 'PRICE_BOOK' OR (snapshot->'priceBook'->>'id') IS DISTINCT FROM NEW."bookId"::text OR (snapshot->'priceBook'->>'version') IS DISTINCT FROM NEW."bookVersion" OR (snapshot->'priceBook'->>'structureVersion') IS DISTINCT FROM NEW."structureVersion" THEN
  RAISE EXCEPTION 'Price-book snapshot binding mismatch' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER pricing_estimate_book_validate BEFORE INSERT ON pricing_estimate_books FOR EACH ROW EXECUTE FUNCTION validate_pricing_estimate_book();
CREATE TRIGGER pricing_estimate_book_immutable BEFORE UPDATE OR DELETE ON pricing_estimate_books FOR EACH ROW EXECUTE FUNCTION reject_pricing_estimate_mutation();
CREATE FUNCTION require_pricing_estimate_book() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.result->>'pricingBasis'='PRICE_BOOK' AND NOT EXISTS(SELECT 1 FROM pricing_estimate_books WHERE "estimateId"=NEW.id) THEN RAISE EXCEPTION 'Native estimate requires immutable price-book binding' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END; $$;
CREATE CONSTRAINT TRIGGER pricing_estimate_book_required AFTER INSERT ON pricing_estimates DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_pricing_estimate_book();
COMMIT;
