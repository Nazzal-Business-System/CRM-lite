import {
  hasPermission, PERMISSION_KEYS, type AuthUser, type PermissionKey,
  type MySessionListQuery, type AdminSessionListQuery,
  type SessionSummary, type AdminSessionSummary, type PaginatedResult, type SessionRevocationResult,
} from "@nbs/shared";
import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../lib/prisma";
import { AppError, forbidden, notFound } from "../lib/errors";
import { writeAuditLog } from "./audit.service";
import { lockSessionUser } from "./sessions.service";

// Deliberate projection: neither credentials nor hashes are read for management.
const sessionSelect = {
  id: true, userId: true, sessionVersion: true, isLegacy: true,
  createdAt: true, lastActivityAt: true, idleExpiresAt: true, absoluteExpiresAt: true,
  revokedAt: true, userAgent: true,
  user: { select: { id: true, name: true, email: true, isActive: true, sessionVersion: true } },
} as const;
type Row = Prisma.SessionGetPayload<{ select: typeof sessionSelect }>;

async function storage<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation(); } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(503, "SERVICE_UNAVAILABLE", "Session management is temporarily unavailable.");
  }
}

function assertPermission(actor: AuthUser, permission: PermissionKey) {
  if (!hasPermission(actor.permissions, permission)) throw forbidden();
}

function deviceMetadata(raw: string | null): SessionSummary["device"] {
  const ua = raw?.slice(0, 256) ?? "";
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Firefox\/|FxiOS\//.test(ua) ? "Firefox" :
    /Chrome\/|CriOS\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Unknown";
  const operatingSystem = /iPhone|iPad|iPod/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" :
    /Windows/.test(ua) ? "Windows" : /Macintosh|Mac OS/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "Unknown";
  const type = /iPad|Tablet/.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua)) ? "tablet" :
    /Mobile|iPhone|iPod/.test(ua) ? "mobile" : operatingSystem !== "Unknown" ? "desktop" : "unknown";
  return { browser, operatingSystem, type };
}

function serialize(row: Row, currentSessionId: string, now: Date): SessionSummary {
  const status = row.revokedAt ? "REVOKED" : !row.user.isActive || row.sessionVersion !== row.user.sessionVersion ? "INVALIDATED" :
    row.idleExpiresAt <= now || row.absoluteExpiresAt <= now ? "EXPIRED" : "ACTIVE";
  return {
    id: row.id, isCurrent: row.id === currentSessionId, isLegacy: row.isLegacy, status,
    device: deviceMetadata(row.userAgent), createdAt: row.createdAt.toISOString(), lastActivityAt: row.lastActivityAt.toISOString(),
    idleExpiresAt: row.idleExpiresAt.toISOString(), absoluteExpiresAt: row.absoluteExpiresAt.toISOString(),
    expiresAt: new Date(Math.min(row.idleExpiresAt.getTime(), row.absoluteExpiresAt.getTime())).toISOString(),
    revokedAt: row.revokedAt?.toISOString() ?? null,
  };
}

export async function listMySessions(userId: string, currentSessionId: string, query: MySessionListQuery): Promise<PaginatedResult<SessionSummary>> {
  return storage(async () => {
    const where = { userId };
    const [rows, total] = await Promise.all([
      prisma.session.findMany({ where, select: sessionSelect, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      prisma.session.count({ where }),
    ]);
    const now = new Date();
    return { items: rows.map((row) => serialize(row, currentSessionId, now)), total, page: query.page, pageSize: query.pageSize };
  });
}

export async function listAdminSessions(actor: AuthUser, currentSessionId: string, query: AdminSessionListQuery): Promise<PaginatedResult<AdminSessionSummary>> {
  assertPermission(actor, PERMISSION_KEYS.SESSIONS_VIEW);
  return storage(async () => {
    const where: Prisma.SessionWhereInput = {
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.revoked !== undefined ? { revokedAt: query.revoked === "true" ? { not: null } : null } : {}),
      ...(query.isLegacy !== undefined ? { isLegacy: query.isLegacy === "true" } : {}),
      ...(query.createdFrom || query.createdTo ? { createdAt: {
        ...(query.createdFrom ? { gte: new Date(query.createdFrom) } : {}),
        ...(query.createdTo ? { lte: new Date(query.createdTo) } : {}),
      } } : {}),
      ...(query.search ? { user: { OR: [
        { name: { contains: query.search, mode: "insensitive" } },
        { email: { contains: query.search, mode: "insensitive" } },
      ] } } : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.session.findMany({ where, select: sessionSelect, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      prisma.session.count({ where }),
    ]);
    const now = new Date();
    return { items: rows.map((row) => ({ ...serialize(row, currentSessionId, now), user: {
      id: row.user.id, name: row.user.name, email: row.user.email, isActive: row.user.isActive,
    } })), total, page: query.page, pageSize: query.pageSize };
  });
}

async function revokeOne(actorUserId: string, ownerId: string, sessionId: string, currentSessionId: string, admin: boolean): Promise<SessionRevocationResult> {
  return storage(() => prisma.$transaction(async (tx) => {
    const session = await tx.session.findFirst({ where: { id: sessionId, userId: ownerId }, select: { id: true } });
    // The same response for an unknown ID and an ID owned by someone else.
    if (!session) throw notFound("Session not found.");
    const result = await tx.session.updateMany({ where: { id: sessionId, userId: ownerId, revokedAt: null },
      data: { revokedAt: new Date(), revocationReason: admin ? "ADMIN_REVOKED" : "SELF_REVOKED" } });
    if (result.count) await writeAuditLog({
      actorUserId, action: admin ? "ADMIN_SESSION_REVOKED" : "SESSION_REVOKED", entityType: "SESSION", entityId: sessionId,
      metadata: { targetUserId: ownerId },
    }, tx);
    return { ok: true, revokedCount: result.count, currentSessionRevoked: sessionId === currentSessionId };
  }));
}

export function revokeMySession(userId: string, sessionId: string, currentSessionId: string) {
  return revokeOne(userId, userId, sessionId, currentSessionId, false);
}

export function revokeAdminSession(actor: AuthUser, ownerId: string, sessionId: string, currentSessionId: string) {
  assertPermission(actor, PERMISSION_KEYS.SESSIONS_REVOKE);
  return revokeOne(actor.id, ownerId, sessionId, currentSessionId, true);
}

export async function revokeOtherSessions(userId: string, currentSessionId: string): Promise<SessionRevocationResult> {
  return storage(() => prisma.$transaction(async (tx) => {
    await lockSessionUser(tx, userId);
    const user = await tx.user.findUnique({ where: { id: userId }, select: { legacyInvalidBefore: true } });
    if (!user) throw notFound("User not found.");
    const now = new Date();
    const cutoff = user.legacyInvalidBefore && user.legacyInvalidBefore > now ? user.legacyInvalidBefore : now;
    // Block old JWTs that have not yet been adopted into the session table.
    // Existing current-session records do not rely on this adoption cutoff.
    await tx.user.update({ where: { id: userId }, data: { legacyInvalidBefore: cutoff } });
    const result = await tx.session.updateMany({ where: { userId, id: { not: currentSessionId }, revokedAt: null },
      data: { revokedAt: now, revocationReason: "SELF_OTHER_SESSIONS" } });
    await writeAuditLog({ actorUserId: userId, action: "OTHER_SESSIONS_REVOKED", entityType: "SESSION",
      metadata: { preservedSessionId: currentSessionId, revokedCount: result.count } }, tx);
    return { ok: true, revokedCount: result.count, currentSessionRevoked: false };
  }));
}
