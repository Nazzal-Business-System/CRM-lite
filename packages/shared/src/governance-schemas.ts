import { z } from "zod";
import { OWNERSHIP_ENTITY_TYPES, OWNERSHIP_REQUEST_STATUSES } from "./governance";

export const auditLogQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().optional().default(""),
  actorUserId: z.string().optional(),
  action: z.string().trim().optional(),
  entityType: z.string().trim().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});
export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;

export const notificationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  unreadOnly: z.enum(["true", "false"]).optional().transform((value) => value === "true"),
});
export type NotificationQuery = z.infer<typeof notificationQuerySchema>;

export const ownershipRequestQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(OWNERSHIP_REQUEST_STATUSES).optional(),
  entityType: z.enum(OWNERSHIP_ENTITY_TYPES).optional(),
});
export type OwnershipRequestQuery = z.infer<typeof ownershipRequestQuerySchema>;

export const createOwnershipRequestSchema = z.object({
  entityType: z.enum(OWNERSHIP_ENTITY_TYPES),
  entityId: z.string().min(1),
});

export const reviewOwnershipRequestSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  rejectionReason: z.string().trim().max(1000).nullable().optional(),
});
