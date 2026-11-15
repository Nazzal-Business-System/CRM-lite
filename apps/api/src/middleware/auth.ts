import type { NextFunction, Request, Response } from "express";
import { env } from "../env";
import { AppError, unauthorized } from "../lib/errors";
import { authenticateSession } from "../services/sessions.service";
import { setSessionCookie } from "../lib/cookies";
import { serializeAuthUser } from "../lib/serialize";
import type { AuthUser } from "@nbs/shared";

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthUser;
      authSessionId?: string;
    }
  }
}

export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const token = req.cookies?.[env.COOKIE_NAME] as string | undefined;

  if (!token) {
    next();
    return;
  }

  try {
    const session = await authenticateSession(token, req.get("user-agent"));
    if (session) {
      req.authUser = serializeAuthUser(session.user);
      req.authSessionId = session.id;
      // Never renew a legacy JWT beyond its signed expiration.
      if (!session.isLegacy) setSessionCookie(res, token, Math.max(0, session.idleExpiresAt.getTime() - Date.now()));
    }
    next();
  } catch {
    next(new AppError(503, "SERVICE_UNAVAILABLE", "Authentication service is temporarily unavailable."));
  }
}

export function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  if (!req.authUser) {
    throw unauthorized();
  }

  next();
}
