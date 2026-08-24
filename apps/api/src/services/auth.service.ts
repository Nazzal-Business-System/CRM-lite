import { prisma } from "../lib/prisma";
import { verifyPassword } from "../lib/password";
import { signAccessToken } from "../lib/jwt";
import { serializeAuthUser, userAccessInclude } from "../lib/serialize";
import { unauthorized } from "../lib/errors";
import { logger } from "../lib/logger";
import type { AuthUser } from "@nbs/shared";

const INVALID_CREDENTIALS = "Invalid email or password.";

export async function loginWithPassword(
  email: string,
  password: string,
): Promise<{ token: string; user: AuthUser }> {
  const normalizedEmail = email.trim().toLowerCase();

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    include: userAccessInclude,
  });

  if (!user || !user.isActive) {
    if (user && !user.isActive) {
      logger.warn({ userId: user.id }, "Disabled user attempted sign-in");
    }
    throw unauthorized(INVALID_CREDENTIALS);
  }

  const passwordMatches = await verifyPassword(password, user.passwordHash);
  if (!passwordMatches) {
    throw unauthorized(INVALID_CREDENTIALS);
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
    include: userAccessInclude,
  });

  return {
    token: signAccessToken(updated.id),
    user: serializeAuthUser(updated),
  };
}
