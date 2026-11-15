-- Additive archive markers. Historical snapshots and bindings remain immutable.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
CREATE TABLE pricing_estimate_archives (
 "estimateId" TEXT PRIMARY KEY REFERENCES pricing_estimates(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 "archivedById" TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 "archivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE FUNCTION validate_estimate_archive_owner() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pricing_estimates WHERE id=NEW."estimateId" AND "createdById"=NEW."archivedById") THEN
  RAISE EXCEPTION 'Only the estimate creator may archive it' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER estimate_archive_owner BEFORE INSERT ON pricing_estimate_archives FOR EACH ROW EXECUTE FUNCTION validate_estimate_archive_owner();
CREATE TRIGGER estimate_archive_immutable BEFORE UPDATE OR DELETE ON pricing_estimate_archives FOR EACH ROW EXECUTE FUNCTION reject_pricing_estimate_mutation();
COMMIT;
