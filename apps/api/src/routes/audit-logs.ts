import { auditLogQuerySchema, PERMISSION_KEYS, type AuditLogQuery } from "@nbs/shared";
import { Router } from "express";
import { authenticate, requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/require-permission";
import { parsedQuery, validate } from "../middleware/validate";
import { listAuditLogs } from "../services/audit.service";

export const auditLogsRouter = Router();
auditLogsRouter.use(authenticate, requireAuth, requirePermission(PERMISSION_KEYS.AUDIT_LOGS_VIEW));
auditLogsRouter.get("/", validate(auditLogQuerySchema, "query"), async (req, res) => {
  res.json({ data: await listAuditLogs(parsedQuery<AuditLogQuery>(req)) });
});
