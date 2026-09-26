export const OWNERSHIP_ENTITY_TYPES = ["COMPANY", "OPPORTUNITY", "TASK"] as const;
export type OwnershipEntityType = (typeof OWNERSHIP_ENTITY_TYPES)[number];

export const OWNERSHIP_REQUEST_STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;
export type OwnershipRequestStatus = (typeof OWNERSHIP_REQUEST_STATUSES)[number];

export interface AuditChange {
  field: string;
  before: string | number | boolean | null;
  after: string | number | boolean | null;
}

export interface AuditLogRecord {
  id: string;
  actor: { id: string; name: string; email: string };
  action: string;
  entityType: string;
  entityId: string | null;
  entityLabel: string | null;
  metadata: Record<string, unknown> | null;
  changes: AuditChange[];
  createdAt: string;
}

export interface NotificationRecord {
  id: string;
  type: string;
  title: string;
  message: string;
  titleAr: string | null;
  messageAr: string | null;
  entityType: string | null;
  entityId: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface OwnershipRequestRecord {
  id: string;
  entityType: OwnershipEntityType;
  entityId: string;
  entityLabel: string;
  requester: { id: string; name: string };
  currentOwner: { id: string; name: string } | null;
  requestedOwner: { id: string; name: string };
  status: OwnershipRequestStatus;
  reviewedBy: { id: string; name: string } | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
}
