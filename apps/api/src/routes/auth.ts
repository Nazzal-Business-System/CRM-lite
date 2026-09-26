import { loginSchema } from "@nbs/shared";
import { Router } from "express";
import { clearSessionCookie, setSessionCookie } from "../lib/cookies";
import { authenticate, requireAuth } from "../middleware/auth";
import { loginRateLimit } from "../middleware/rate-limit";
import { validate } from "../middleware/validate";
import { loginWithPassword } from "../services/auth.service";
import { writeAuditLog } from "../services/audit.service";
import { logger } from "../lib/logger";

export const authRouter = Router();

authRouter.post(
  "/login",
  loginRateLimit,
  validate(loginSchema),
  async (req, res) => {
    const { email, password } = req.body as {
      email: string;
      password: string;
    };
    const result = await loginWithPassword(email, password);
    setSessionCookie(res, result.token);
    res.json({ data: { user: result.user } });
  },
);

authRouter.post("/logout", authenticate, (req, res) => {
  // Clearing the browser session must not depend on database availability.
  clearSessionCookie(res);
  res.json({ data: { ok: true } });

  if (req.authUser) {
    const user = req.authUser;
    void writeAuditLog({ actorUserId: user.id, action: "LOGOUT", entityType: "AUTH", entityId: user.id, entityLabel: user.name })
      .catch((error) => {
        logger.error({ err: error, userId: user.id }, "Unable to write logout audit log");
      });
  }
});

authRouter.get("/me", authenticate, requireAuth, (req, res) => {
  res.json({ data: { user: req.authUser } });
});
