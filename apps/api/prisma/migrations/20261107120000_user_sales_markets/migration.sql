-- Requires Phase 02A first. No automatic memberships or business-record changes.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
CREATE TABLE "user_sales_markets" (
  "userId" TEXT NOT NULL,
  "marketCode" VARCHAR(32) NOT NULL,
  "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "assignedByUserId" TEXT NOT NULL,
  CONSTRAINT "user_sales_markets_pkey" PRIMARY KEY ("userId", "marketCode"),
  CONSTRAINT "user_sales_markets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "user_sales_markets_marketCode_fkey" FOREIGN KEY ("marketCode") REFERENCES "sales_markets"("code") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "user_sales_markets_marketCode_idx" ON "user_sales_markets"("marketCode");
COMMIT;
