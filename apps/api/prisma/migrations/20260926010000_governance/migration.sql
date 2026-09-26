-- CRM governance: immutable audit history, user notifications, and ownership approvals.
CREATE TYPE "OwnershipEntityType" AS ENUM ('COMPANY', 'OPPORTUNITY', 'TASK');
CREATE TYPE "OwnershipRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "audit_logs" (
  "id" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT,
  "entityLabel" TEXT,
  "metadata" JSONB,
  "changes" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "notifications" (
  "id" TEXT NOT NULL,
  "recipientUserId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "titleAr" TEXT,
  "messageAr" TEXT,
  "entityType" TEXT,
  "entityId" TEXT,
  "link" TEXT,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ownership_requests" (
  "id" TEXT NOT NULL,
  "entityType" "OwnershipEntityType" NOT NULL,
  "entityId" TEXT NOT NULL,
  "entityLabel" TEXT NOT NULL,
  "requesterUserId" TEXT NOT NULL,
  "currentOwnerId" TEXT,
  "requestedOwnerId" TEXT NOT NULL,
  "status" "OwnershipRequestStatus" NOT NULL DEFAULT 'PENDING',
  "reviewedByUserId" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "rejectionReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ownership_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");
CREATE INDEX "audit_logs_actorUserId_createdAt_idx" ON "audit_logs"("actorUserId", "createdAt");
CREATE INDEX "audit_logs_entityType_entityId_createdAt_idx" ON "audit_logs"("entityType", "entityId", "createdAt");
CREATE INDEX "audit_logs_action_createdAt_idx" ON "audit_logs"("action", "createdAt");
CREATE INDEX "notifications_recipientUserId_createdAt_idx" ON "notifications"("recipientUserId", "createdAt");
CREATE INDEX "notifications_recipientUserId_readAt_createdAt_idx" ON "notifications"("recipientUserId", "readAt", "createdAt");
CREATE INDEX "ownership_requests_requesterUserId_createdAt_idx" ON "ownership_requests"("requesterUserId", "createdAt");
CREATE INDEX "ownership_requests_status_createdAt_idx" ON "ownership_requests"("status", "createdAt");
CREATE INDEX "ownership_requests_entityType_entityId_createdAt_idx" ON "ownership_requests"("entityType", "entityId", "createdAt");
CREATE UNIQUE INDEX "ownership_requests_one_pending_per_requester" ON "ownership_requests"("entityType", "entityId", "requesterUserId") WHERE "status" = 'PENDING';

ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ownership_requests" ADD CONSTRAINT "ownership_requests_requesterUserId_fkey" FOREIGN KEY ("requesterUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ownership_requests" ADD CONSTRAINT "ownership_requests_currentOwnerId_fkey" FOREIGN KEY ("currentOwnerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ownership_requests" ADD CONSTRAINT "ownership_requests_requestedOwnerId_fkey" FOREIGN KEY ("requestedOwnerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ownership_requests" ADD CONSTRAINT "ownership_requests_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "permissions" ("id", "key", "description", "category") VALUES
  ('perm_audit_logs_view', 'audit_logs.view', 'View immutable CRM audit logs', 'Governance'),
  ('perm_ownership_requests_create', 'ownership_requests.create', 'Request ownership of assignable records', 'Governance'),
  ('perm_ownership_requests_view', 'ownership_requests.view', 'View ownership requests', 'Governance'),
  ('perm_ownership_requests_manage', 'ownership_requests.manage', 'Approve or reject ownership requests', 'Governance'),
  ('perm_ownership_assign', 'ownership.assign', 'Directly assign or reassign record ownership', 'Governance')
ON CONFLICT ("key") DO UPDATE SET "description" = EXCLUDED."description", "category" = EXCLUDED."category";

INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."name" = 'Admin'
  AND p."key" IN ('audit_logs.view', 'ownership_requests.create', 'ownership_requests.view', 'ownership_requests.manage', 'ownership.assign')
ON CONFLICT DO NOTHING;

INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "roles" r
JOIN "permissions" p ON p."key" = 'ownership_requests.create'
WHERE r."name" = 'Sales'
ON CONFLICT DO NOTHING;
