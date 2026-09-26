import type { AuditChange, AuditLogQuery, AuditLogRecord, PaginatedResult } from "@nbs/shared";
import { Prisma } from "../generated/prisma/client";
import { skipTake } from "../lib/crm";
import { prisma } from "../lib/prisma";

type DbClient = typeof prisma | Prisma.TransactionClient;

const REDACTED_FIELDS = new Set([
  "password",
  "passwordHash",
  "token",
  "jwt",
  "authorization",
  "cookie",
  "session",
  "secret",
]);

export function conciseChanges(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  fields: readonly string[],
): AuditChange[] {
  return fields.flatMap((field) => {
    if (REDACTED_FIELDS.has(field)) return [];
    const previous = auditValue(before[field]);
    const next = auditValue(after[field]);
    if (previous === next) return [];
    return [{ field, before: previous, after: next }];
  });
}

function auditValue(value: unknown): string | number | boolean | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  if (["string", "number", "boolean"].includes(typeof value)) {
    const normalized = value as string | number | boolean;
    return typeof normalized === "string" && normalized.length > 500
      ? `${normalized.slice(0, 497)}...`
      : normalized;
  }
  return String(value);
}

export async function writeAuditLog(
  input: {
    actorUserId: string;
    action: string;
    entityType: string;
    entityId?: string | null;
    entityLabel?: string | null;
    metadata?: Record<string, unknown> | null;
    changes?: AuditChange[];
  },
  db: DbClient = prisma,
) {
  return db.auditLog.create({
    data: {
      actorUserId: input.actorUserId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      entityLabel: input.entityLabel ?? null,
      metadata: input.metadata ? (input.metadata as Prisma.InputJsonValue) : undefined,
      changes: input.changes?.length
        ? (input.changes as unknown as Prisma.InputJsonValue)
        : undefined,
    },
  });
}

function serializeAudit(row: {
  id: string;
  actor: { id: string; name: string; email: string };
  action: string;
  entityType: string;
  entityId: string | null;
  entityLabel: string | null;
  metadata: Prisma.JsonValue | null;
  changes: Prisma.JsonValue | null;
  createdAt: Date;
}): AuditLogRecord {
  return {
    ...row,
    metadata: (row.metadata as Record<string, unknown> | null) ?? null,
    changes: Array.isArray(row.changes) ? (row.changes as unknown as AuditChange[]) : [],
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listAuditLogs(
  query: AuditLogQuery,
): Promise<PaginatedResult<AuditLogRecord> & { actions: string[]; entityTypes: string[]; actors: Array<{ id: string; name: string }> }> {
  const search = query.search.trim();
  const where: Prisma.AuditLogWhereInput = {
    ...(query.actorUserId ? { actorUserId: query.actorUserId } : {}),
    ...(query.action ? { action: query.action } : {}),
    ...(query.entityType ? { entityType: query.entityType } : {}),
    ...(query.from || query.to
      ? { createdAt: { ...(query.from ? { gte: new Date(query.from) } : {}), ...(query.to ? { lte: new Date(query.to) } : {}) } }
      : {}),
    ...(search
      ? {
          OR: [
            { entityLabel: { contains: search, mode: "insensitive" } },
            { action: { contains: search, mode: "insensitive" } },
            { entityType: { contains: search, mode: "insensitive" } },
            { actor: { name: { contains: search, mode: "insensitive" } } },
            { actor: { email: { contains: search, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
  const { skip, take } = skipTake(query.page, query.pageSize);
  const [rows, total, actionRows, entityRows, actorRows] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: { actor: { select: { id: true, name: true, email: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip,
      take,
    }),
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({ distinct: ["action"], select: { action: true }, orderBy: { action: "asc" } }),
    prisma.auditLog.findMany({ distinct: ["entityType"], select: { entityType: true }, orderBy: { entityType: "asc" } }),
    prisma.auditLog.findMany({ distinct: ["actorUserId"], select: { actor: { select: { id: true, name: true } } }, orderBy: { actorUserId: "asc" } }),
  ]);
  return {
    items: rows.map(serializeAudit),
    total,
    page: query.page,
    pageSize: query.pageSize,
    actions: actionRows.map((row) => row.action),
    entityTypes: entityRows.map((row) => row.entityType),
    actors: actorRows.map((row) => row.actor).sort((a, b) => a.name.localeCompare(b.name)),
  };
}
