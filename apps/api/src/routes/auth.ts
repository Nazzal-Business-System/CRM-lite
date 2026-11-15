import { loginSchema } from "@nbs/shared";
import { Router } from "express";
import { clearSessionCookie, setSessionCookie } from "../lib/cookies";
import { authenticate, requireAuth } from "../middleware/auth";
import { loginRateLimit } from "../middleware/rate-limit";
import { validate } from "../middleware/validate";
import { loginWithPassword } from "../services/auth.service";
import { writeAuditLog } from "../services/audit.service";
import { logger } from "../lib/logger";
import { AppError } from "../lib/errors";
import { revokeSessionToken } from "../services/sessions.service";
import { env } from "../env";

export const authRouter = Router();

authRouter.use((_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

authRouter.post(
  "/login",
  loginRateLimit,
  validate(loginSchema),
  async (req, res) => {
    const { email, password } = req.body as {
      email: string;
      password: string;
    };
    const result = await loginWithPassword(email, password, req.get("user-agent")).catch((error: unknown) => {
      if (error instanceof AppError) throw error;
      throw new AppError(503, "SERVICE_UNAVAILABLE", "Sign-in service is temporarily unavailable.");
    });
    setSessionCookie(res, result.token, Math.max(0, result.expiresAt.getTime() - Date.now()));
    res.json({ data: { user: result.user } });
  },
);

authRouter.post("/logout", async (req, res) => {
  clearSessionCookie(res);
  const token = req.cookies?.[env.COOKIE_NAME];
  try {
    if (typeof token === "string") {
      const userId = await revokeSessionToken(token, req.get("user-agent"));
      if (userId) void writeAuditLog({ actorUserId: userId, action: "LOGOUT", entityType: "AUTH", entityId: userId })
        .catch((error: unknown) => logger.error({ err: error, userId }, "Unable to write logout audit log"));
    }
  } catch {
    // Local logout still succeeds, but do not falsely claim durable revocation.
    throw new AppError(503, "SERVICE_UNAVAILABLE", "Session revocation is temporarily unavailable.");
  }
  res.json({ data: { ok: true } });
});

authRouter.get("/me", authenticate, requireAuth, (req, res) => {
  res.json({ data: { user: req.authUser } });
});
