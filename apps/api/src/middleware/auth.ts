import type { NextFunction, Request, Response } from "express";
import { env } from "../env";
import { unauthorized } from "../lib/errors";
import { verifyAccessToken } from "../lib/jwt";
import { prisma } from "../lib/prisma";
import { serializeAuthUser, userAccessInclude } from "../lib/serialize";
import type { AuthUser } from "@nbs/shared";

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthUser;
    }
  }
}

export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const token = req.cookies?.[env.COOKIE_NAME] as string | undefined;

  if (!token) {
    next();
    return;
  }

  try {
    const userId = verifyAccessToken(token);
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: userAccessInclude,
    });

    if (!user || !user.isActive) {
      next();
      return;
    }

    req.authUser = serializeAuthUser(user);
    next();
  } catch {
    next();
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
