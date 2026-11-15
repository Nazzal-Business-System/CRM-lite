import { createHash, randomBytes } from "node:crypto";
import { env } from "../env";
import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../lib/prisma";
import { signAccessToken, verifyLegacyClaims } from "../lib/jwt";
import { unauthorized } from "../lib/errors";
import { userAccessInclude } from "../lib/serialize";

export const IDLE_MS = 7 * 24 * 60 * 60 * 1000;
export const ABSOLUTE_MS = 30 * 24 * 60 * 60 * 1000;
export const ACTIVITY_INTERVAL_MS = 60_000;
const OPAQUE_PATTERN = /^nbs_s1_[A-Za-z0-9_-]{43}$/;
const sessionInclude = { user: { include: userAccessInclude } } as const;
type SessionWithUser = Prisma.SessionGetPayload<{ include: typeof sessionInclude }>;

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function newSessionToken(): string {
  return `nbs_s1_${randomBytes(32).toString("base64url")}`;
}

export function idleExpiry(now: Date, absolute: Date): Date {
  return new Date(Math.min(now.getTime() + IDLE_MS, absolute.getTime()));
}

export async function lockSessionUser(tx: Prisma.TransactionClient, userId: string): Promise<void> {
  // Serializes session issuance/adoption with credential changes and deactivation.
  await tx.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${userId} FOR UPDATE`;
}

export async function createLoginSession(userId: string, verifiedPasswordHash: string, userAgent?: string) {
  return prisma.$transaction(async (tx) => {
    await lockSessionUser(tx, userId);
    const user = await tx.user.findUnique({ where: { id: userId }, include: userAccessInclude });
    if (!user?.isActive || user.passwordHash !== verifiedPasswordHash) throw unauthorized();
    const now = new Date();
    const legacy = env.SESSION_TOKEN_MODE === "legacy";
    const token = legacy ? signAccessToken(userId) : newSessionToken();
    const absolute = new Date(now.getTime() + ABSOLUTE_MS);
    const expires = legacy
      ? new Date(Math.min(verifyLegacyClaims(token).exp * 1000, absolute.getTime(), now.getTime() + IDLE_MS))
      : idleExpiry(now, absolute);
    const session = await tx.session.create({ data: {
      tokenHash: hashSessionToken(token), userId, sessionVersion: user.sessionVersion,
      isLegacy: legacy, createdAt: now, lastActivityAt: now,
      idleExpiresAt: expires, absoluteExpiresAt: absolute, userAgent: cleanUserAgent(userAgent),
    } });
    const updated = await tx.user.update({ where: { id: userId }, data: { lastLoginAt: now }, include: userAccessInclude });
    return { token, session, user: updated };
  });
}

function cleanUserAgent(value?: string): string | null {
  return value ? Array.from(value).filter((char) => {
    const code = char.charCodeAt(0);
    return code >= 32 && code !== 127;
  }).join("").slice(0, 256) || null : null;
}

function legacyClaims(token: string) {
  if (env.ACCEPT_LEGACY_JWT !== "true" || token.length > 4096) return null;
  try { return verifyLegacyClaims(token); } catch { return null; }
}

async function adoptLegacy(token: string, claims: NonNullable<ReturnType<typeof legacyClaims>>, userAgent: string | undefined, revoke: boolean) {
  return prisma.$transaction(async (tx) => {
    await lockSessionUser(tx, claims.sub);
    const user = await tx.user.findUnique({ where: { id: claims.sub }, include: userAccessInclude });
    if (!user?.isActive || (user.legacyInvalidBefore && claims.iat * 1000 <= user.legacyInvalidBefore.getTime())) return null;
    const now = new Date();
    const absolute = new Date(claims.iat * 1000 + ABSOLUTE_MS);
    const expires = new Date(Math.min(claims.exp * 1000, absolute.getTime(), now.getTime() + IDLE_MS));
    if (expires <= now) return null;
    // Empty update never resurrects revoked/expired records. The unique hash also
    // makes adoption safe when several requests first present the same JWT.
    return tx.session.upsert({
      where: { tokenHash: hashSessionToken(token) }, update: {},
      create: {
        tokenHash: hashSessionToken(token), userId: user.id, sessionVersion: user.sessionVersion,
        isLegacy: true, createdAt: new Date(claims.iat * 1000), lastActivityAt: now,
        idleExpiresAt: expires, absoluteExpiresAt: absolute, userAgent: cleanUserAgent(userAgent),
        ...(revoke ? { revokedAt: now, revocationReason: "LOGOUT" } : {}),
      }, include: sessionInclude,
    });
  });
}

function usable(session: SessionWithUser, now: Date): boolean {
  return !session.revokedAt && session.user.isActive &&
    session.sessionVersion === session.user.sessionVersion &&
    session.idleExpiresAt > now && session.absoluteExpiresAt > now;
}

export async function authenticateSession(token: string, userAgent?: string, at?: Date) {
  const opaque = OPAQUE_PATTERN.test(token);
  const claims = opaque ? null : legacyClaims(token);
  if (!opaque && !claims) return null;
  let session = await prisma.session.findUnique({ where: { tokenHash: hashSessionToken(token) }, include: sessionInclude });
  if (!session && claims) session = await adoptLegacy(token, claims, userAgent, false);
  const now = at ?? new Date();
  if (!session || session.isLegacy === opaque || !usable(session, now)) return null;

  if (now.getTime() - session.lastActivityAt.getTime() >= ACTIVITY_INTERVAL_MS) {
    const expires = session.isLegacy ? session.idleExpiresAt : idleExpiry(now, session.absoluteExpiresAt);
    const touched = await prisma.session.updateMany({ where: {
      id: session.id, revokedAt: null, lastActivityAt: session.lastActivityAt,
      idleExpiresAt: { gt: now }, absoluteExpiresAt: { gt: now },
      user: { isActive: true, sessionVersion: session.sessionVersion },
    }, data: { lastActivityAt: now, idleExpiresAt: expires } });
    if (touched.count === 1) session = { ...session, lastActivityAt: now, idleExpiresAt: expires };
    else {
      // A concurrent touch, logout, or credential change must not be overwritten.
      session = await prisma.session.findUnique({ where: { tokenHash: hashSessionToken(token) }, include: sessionInclude });
      if (!session || !usable(session, now)) return null;
    }
  }
  return session;
}

export async function revokeSessionToken(token: string, userAgent?: string): Promise<string | undefined> {
  const opaque = OPAQUE_PATTERN.test(token);
  const claims = opaque ? null : legacyClaims(token);
  if (!opaque && !claims) return;
  const session = claims
    ? await adoptLegacy(token, claims, userAgent, true)
    : await prisma.session.findUnique({ where: { tokenHash: hashSessionToken(token) }, include: sessionInclude });
  await prisma.session.updateMany({ where: { tokenHash: hashSessionToken(token), revokedAt: null },
    data: { revokedAt: new Date(), revocationReason: "LOGOUT" } });
  return session?.userId;
}

export async function revokeUserSessions(tx: Prisma.TransactionClient, userId: string, reason: "PASSWORD_CHANGED" | "ACCOUNT_DEACTIVATED") {
  const now = new Date();
  await tx.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now, revocationReason: reason } });
}
