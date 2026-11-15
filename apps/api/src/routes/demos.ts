import { Router } from "express";
import { PERMISSION_KEYS } from "@nbs/shared";
import { authenticate, requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/require-permission";
import { liveDemos } from "../config/demos";
export const demosRouter = Router();
demosRouter.use((_req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
demosRouter.get("/", authenticate, requireAuth, requirePermission(PERMISSION_KEYS.DEMOS_VIEW), (_req, res) => { res.json({ data: liveDemos }); });
