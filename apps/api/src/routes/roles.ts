import {
  createRoleSchema,
  hasPermission,
  PERMISSION_KEYS,
  updateRoleSchema,
} from "@nbs/shared";
import { Router } from "express";
import { forbidden } from "../lib/errors";
import { authenticate, requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/require-permission";
import { validate } from "../middleware/validate";
import {
  createRole,
  deleteRole,
  listPermissionCatalog,
  listRoleOptions,
  listRoles,
  updateRole,
} from "../services/roles.service";

export const rolesRouter = Router();

rolesRouter.use(authenticate, requireAuth);

rolesRouter.get(
  "/",
  requirePermission(PERMISSION_KEYS.ROLES_VIEW),
  async (_req, res) => {
    const [roles, catalog] = await Promise.all([
      listRoles(),
      listPermissionCatalog(),
    ]);
    res.json({ data: { roles, catalog } });
  },
);

rolesRouter.get("/options", async (req, res) => {
  const permissions = req.authUser?.permissions ?? [];
  const allowed =
    hasPermission(permissions, PERMISSION_KEYS.ROLES_VIEW) ||
    hasPermission(permissions, PERMISSION_KEYS.USERS_CREATE) ||
    hasPermission(permissions, PERMISSION_KEYS.USERS_UPDATE);

  if (!allowed) {
    throw forbidden();
  }

  const roles = await listRoleOptions();
  res.json({ data: { roles } });
});

rolesRouter.post(
  "/",
  requirePermission(PERMISSION_KEYS.ROLES_CREATE),
  validate(createRoleSchema),
  async (req, res) => {
    const role = await createRole(req.body);
    res.status(201).json({ data: { role } });
  },
);

rolesRouter.patch(
  "/:id",
  requirePermission(PERMISSION_KEYS.ROLES_UPDATE),
  validate(updateRoleSchema),
  async (req, res) => {
    const role = await updateRole(req.params.id as string, req.body);
    res.json({ data: { role } });
  },
);

rolesRouter.delete(
  "/:id",
  requirePermission(PERMISSION_KEYS.ROLES_DELETE),
  async (req, res) => {
    await deleteRole(req.params.id as string);
    res.json({ data: { ok: true } });
  },
);
