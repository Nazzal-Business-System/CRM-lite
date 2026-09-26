import { notificationQuerySchema, type NotificationQuery } from "@nbs/shared";
import { Router } from "express";
import { authenticate, requireAuth } from "../middleware/auth";
import { parsedQuery, validate } from "../middleware/validate";
import { listNotifications, markAllNotificationsRead, markNotificationRead } from "../services/notifications.service";

export const notificationsRouter = Router();
notificationsRouter.use(authenticate, requireAuth);
notificationsRouter.get("/", validate(notificationQuerySchema, "query"), async (req, res) => {
  res.json({ data: await listNotifications(req.authUser!.id, parsedQuery<NotificationQuery>(req)) });
});
notificationsRouter.patch("/:id/read", async (req, res) => {
  res.json({ data: await markNotificationRead(req.authUser!.id, String(req.params.id)) });
});
notificationsRouter.post("/read-all", async (req, res) => {
  res.json({ data: await markAllNotificationsRead(req.authUser!.id) });
});
