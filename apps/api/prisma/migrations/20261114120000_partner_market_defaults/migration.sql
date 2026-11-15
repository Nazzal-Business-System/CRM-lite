-- Additive only. Legacy accounts remain INTERNAL with no assumed default market.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
CREATE TYPE "UserAccountType" AS ENUM ('INTERNAL', 'PARTNER');
ALTER TABLE "users" ADD COLUMN "accountType" "UserAccountType" NOT NULL DEFAULT 'INTERNAL',
  ADD COLUMN "defaultMarketCode" VARCHAR(32);
ALTER TABLE "users" ADD CONSTRAINT "users_defaultMarketCode_fkey" FOREIGN KEY ("defaultMarketCode")
  REFERENCES "sales_markets"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "users_defaultMarketCode_idx" ON "users"("defaultMarketCode");
COMMIT;
