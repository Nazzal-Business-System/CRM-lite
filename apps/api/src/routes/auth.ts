import { loginSchema } from "@nbs/shared";
import { Router } from "express";
import { clearSessionCookie, setSessionCookie } from "../lib/cookies";
import { authenticate, requireAuth } from "../middleware/auth";
import { loginRateLimit } from "../middleware/rate-limit";
import { validate } from "../middleware/validate";
import { loginWithPassword } from "../services/auth.service";

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

authRouter.post("/logout", authenticate, (_req, res) => {
  clearSessionCookie(res);
  res.json({ data: { ok: true } });
});

authRouter.get("/me", authenticate, requireAuth, (req, res) => {
  res.json({ data: { user: req.authUser } });
});
