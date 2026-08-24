import {
  createUserSchema,
  PERMISSION_KEYS,
  updateUserActivationSchema,
  updateUserSchema,
} from "@nbs/shared";
import { Router } from "express";
import { authenticate, requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/require-permission";
import { validate } from "../middleware/validate";
import { listActiveUserOptions, createUser, listUsers, updateUser } from "../services/users.service";

export const usersRouter = Router();

usersRouter.use(authenticate, requireAuth);

usersRouter.get("/options", async (_req, res) => {
  const users = await listActiveUserOptions();
  res.json({ data: { users } });
});

usersRouter.get(
  "/",
  requirePermission(PERMISSION_KEYS.USERS_VIEW),
  async (_req, res) => {
    const users = await listUsers();
    res.json({ data: { users } });
  },
);

usersRouter.post(
  "/",
  requirePermission(PERMISSION_KEYS.USERS_CREATE),
  validate(createUserSchema),
  async (req, res) => {
    const user = await createUser(req.body);
    res.status(201).json({ data: { user } });
  },
);

usersRouter.patch(
  "/:id",
  requirePermission(PERMISSION_KEYS.USERS_UPDATE),
  validate(updateUserSchema),
  async (req, res) => {
    const user = await updateUser(String(req.params.id), req.body);
    res.json({ data: { user } });
  },
);

usersRouter.patch(
  "/:id/activation",
  requirePermission(PERMISSION_KEYS.USERS_DEACTIVATE),
  validate(updateUserActivationSchema),
  async (req, res) => {
    const user = await updateUser(String(req.params.id), {
      isActive: req.body.isActive,
    });
    res.json({ data: { user } });
  },
);
