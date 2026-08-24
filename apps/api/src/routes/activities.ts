import {
  activityListQuerySchema,
  createActivitySchema,
  hasPermission,
  PERMISSION_KEYS,
  updateActivitySchema,
  type ActivityListQuery,
} from "@nbs/shared";
import { Router } from "express";
import { forbidden } from "../lib/errors";
import { authenticate, requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/require-permission";
import { validate, parsedQuery } from "../middleware/validate";
import {
  createActivity,
  deleteActivity,
  listActivities,
  updateActivity,
} from "../services/activities.service";

export const activitiesRouter = Router();

activitiesRouter.use(authenticate, requireAuth);

activitiesRouter.get(
  "/",
  requirePermission(PERMISSION_KEYS.ACTIVITIES_VIEW),
  validate(activityListQuerySchema, "query"),
  async (req, res) => {
    const result = await listActivities(parsedQuery<ActivityListQuery>(req));
    res.json({ data: result });
  },
);

activitiesRouter.post(
  "/",
  requirePermission(PERMISSION_KEYS.ACTIVITIES_CREATE),
  validate(createActivitySchema),
  async (req, res) => {
    if (
      req.body.nextTask &&
      !hasPermission(req.authUser!.permissions, PERMISSION_KEYS.TASKS_CREATE)
    ) {
      throw forbidden("You do not have permission to create follow-ups.");
    }
    const activity = await createActivity(req.authUser!.id, req.body);
    res.status(201).json({ data: { activity } });
  },
);

activitiesRouter.patch(
  "/:id",
  requirePermission(PERMISSION_KEYS.ACTIVITIES_UPDATE),
  validate(updateActivitySchema),
  async (req, res) => {
    const activity = await updateActivity(String(req.params.id), req.body);
    res.json({ data: { activity } });
  },
);

activitiesRouter.delete(
  "/:id",
  requirePermission(PERMISSION_KEYS.ACTIVITIES_DELETE),
  async (req, res) => {
    await deleteActivity(String(req.params.id));
    res.json({ data: { ok: true } });
  },
);
