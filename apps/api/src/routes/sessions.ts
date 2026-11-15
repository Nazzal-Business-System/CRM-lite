import {
  mySessionListQuerySchema, adminSessionListQuerySchema, sessionIdParamsSchema, adminSessionParamsSchema,
  revokeOtherSessionsSchema, PERMISSION_KEYS, type MySessionListQuery, type AdminSessionListQuery,
} from "@nbs/shared";
import { Router, type Request } from "express";
import { authenticate, requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/require-permission";
import { parsedQuery, validate } from "../middleware/validate";
import { AppError, unauthorized } from "../lib/errors";
import { clearSessionCookie } from "../lib/cookies";
import { listMySessions, listAdminSessions, revokeMySession, revokeAdminSession, revokeOtherSessions } from "../services/session-management.service";

function context(req: Request) {
  if (!req.authUser || !req.authSessionId) throw unauthorized();
  return { actor: req.authUser, sessionId: req.authSessionId };
}

export const mySessionsRouter = Router();
export const adminSessionsRouter = Router();
for (const router of [mySessionsRouter, adminSessionsRouter]) {
  router.use((_req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
  router.use(authenticate, requireAuth);
  router.use((req, _res, next) => {
    // The shared query validator compacts non-string values; reject ambiguous
    // duplicate/nested parameters before that compaction can hide them.
    if (Object.values(req.query).some((value) => typeof value !== "string")) {
      throw new AppError(400, "VALIDATION_ERROR", "Query parameters must contain one string value each.");
    }
    next();
  });
}

mySessionsRouter.get("/", validate(mySessionListQuerySchema, "query"), async (req, res) => {
  const current = context(req);
  res.json({ data: await listMySessions(current.actor.id, current.sessionId, parsedQuery<MySessionListQuery>(req)) });
});
mySessionsRouter.post("/revoke-others", validate(revokeOtherSessionsSchema), async (req, res) => {
  const current = context(req);
  res.json({ data: await revokeOtherSessions(current.actor.id, current.sessionId) });
});
mySessionsRouter.delete("/:sessionId", validate(sessionIdParamsSchema, "params"), async (req, res) => {
  const current = context(req);
  const result = await revokeMySession(current.actor.id, String(req.params.sessionId), current.sessionId);
  if (result.currentSessionRevoked) clearSessionCookie(res);
  res.json({ data: result });
});

adminSessionsRouter.get("/sessions", requirePermission(PERMISSION_KEYS.SESSIONS_VIEW), validate(adminSessionListQuerySchema, "query"), async (req, res) => {
  const current = context(req);
  res.json({ data: await listAdminSessions(current.actor, current.sessionId, parsedQuery<AdminSessionListQuery>(req)) });
});
adminSessionsRouter.delete("/users/:userId/sessions/:sessionId", requirePermission(PERMISSION_KEYS.SESSIONS_REVOKE), validate(adminSessionParamsSchema, "params"), async (req, res) => {
  const current = context(req);
  const result = await revokeAdminSession(current.actor, String(req.params.userId), String(req.params.sessionId), current.sessionId);
  if (result.currentSessionRevoked) clearSessionCookie(res);
  res.json({ data: result });
});
