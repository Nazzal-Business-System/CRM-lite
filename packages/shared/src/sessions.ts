import { z } from "zod";

const id = z.string().trim().min(1).max(128);
export const mySessionListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
}).strict();
export const adminSessionListQuerySchema = mySessionListQuerySchema.extend({
  userId: id.optional(),
  search: z.string().trim().max(200).default(""),
  revoked: z.enum(["true", "false"]).optional(),
  isLegacy: z.enum(["true", "false"]).optional(),
  createdFrom: z.string().datetime().optional(),
  createdTo: z.string().datetime().optional(),
}).refine((value) => !value.createdFrom || !value.createdTo || Date.parse(value.createdFrom) <= Date.parse(value.createdTo), {
  path: ["createdTo"], message: "End date must not precede start date.",
});
export const revokeOtherSessionsSchema = z.object({}).strict().optional();
export const sessionIdParamsSchema = z.object({ sessionId: id }).strict();
export const adminSessionParamsSchema = sessionIdParamsSchema.extend({ userId: id });
export type MySessionListQuery = z.infer<typeof mySessionListQuerySchema>;
export type AdminSessionListQuery = z.infer<typeof adminSessionListQuerySchema>;

export interface SessionSummary {
  id: string;
  isCurrent: boolean;
  isLegacy: boolean;
  status: "ACTIVE" | "REVOKED" | "EXPIRED" | "INVALIDATED";
  device: { browser: string; operatingSystem: string; type: "desktop" | "mobile" | "tablet" | "unknown" };
  createdAt: string;
  lastActivityAt: string;
  idleExpiresAt: string;
  absoluteExpiresAt: string;
  expiresAt: string;
  revokedAt: string | null;
}
export interface AdminSessionSummary extends SessionSummary {
  user: { id: string; name: string; email: string; isActive: boolean };
}
export interface SessionRevocationResult {
  ok: true;
  revokedCount: number;
  currentSessionRevoked: boolean;
}
