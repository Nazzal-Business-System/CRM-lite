-- Additive only. Apply separately with explicit verified-target approval.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
CREATE TABLE "pricing_estimates" (
  "id" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "companyId" TEXT,
  "title" VARCHAR(200) NOT NULL,
  "notes" TEXT NOT NULL,
  "currency" VARCHAR(3) NOT NULL,
  "catalogVersion" VARCHAR(80) NOT NULL,
  "calculationVersion" VARCHAR(80) NOT NULL,
  "configurationVersion" INTEGER NOT NULL,
  "selection" JSONB NOT NULL,
  "result" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pricing_estimates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pricing_estimates_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "pricing_estimates_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "pricing_estimates_fields_check" CHECK (length(trim("title")) > 0 AND length("notes") <= 4000 AND "currency" = 'JOD' AND "configurationVersion" > 0 AND length("catalogVersion") > 0 AND length("calculationVersion") > 0),
  CONSTRAINT "pricing_estimates_snapshot_check" CHECK (
    jsonb_typeof("selection") = 'object' AND jsonb_typeof("result") = 'object'
    AND ("selection"->>'catalogVersion') IS NOT DISTINCT FROM "catalogVersion"
    AND ("selection"->>'configurationVersion') IS NOT DISTINCT FROM "configurationVersion"::text
    AND ("result"->>'catalogVersion') IS NOT DISTINCT FROM "catalogVersion"
    AND ("result"->>'configurationVersion') IS NOT DISTINCT FROM "configurationVersion"::text
    AND ("result"->>'currency') IS NOT DISTINCT FROM "currency"
  )
);
CREATE INDEX "pricing_estimates_createdById_createdAt_id_idx" ON "pricing_estimates"("createdById", "createdAt", "id");
CREATE INDEX "pricing_estimates_companyId_createdAt_id_idx" ON "pricing_estimates"("companyId", "createdAt", "id");
CREATE INDEX "pricing_estimates_createdAt_id_idx" ON "pricing_estimates"("createdAt", "id");
-- Snapshots are append-only even if a future application accidentally attempts a mutation.
CREATE FUNCTION "reject_pricing_estimate_mutation"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Pricing estimates are immutable; create a new copy' USING ERRCODE = '55000';
END;
$$;
CREATE TRIGGER "pricing_estimates_immutable" BEFORE UPDATE OR DELETE ON "pricing_estimates"
  FOR EACH ROW EXECUTE FUNCTION "reject_pricing_estimate_mutation"();
COMMIT;
