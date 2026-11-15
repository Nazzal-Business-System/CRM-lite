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
import { prisma } from "../lib/prisma";
import { userAccessInclude, serializeAuthUser } from "../lib/serialize";
import { notFound } from "../lib/errors";

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
    const user = await createUser(req.body, req.authUser!.id, req.authUser!);
    res.status(201).json({ data: { user } });
  },
);
usersRouter.get("/:id", requirePermission(PERMISSION_KEYS.USERS_VIEW), async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: String(req.params.id) }, include: userAccessInclude });
  if (!user) throw notFound("Account not found.");
  res.json({ data: { user: serializeAuthUser(user) } });
});

usersRouter.patch(
  "/:id",
  requirePermission(PERMISSION_KEYS.USERS_UPDATE),
  validate(updateUserSchema),
  async (req, res) => {
    const user = await updateUser(String(req.params.id), req.body, req.authUser!.id, req.authUser!);
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
    }, req.authUser!.id);
    res.json({ data: { user } });
  },
);
