import {
  createTaskSchema,
  PERMISSION_KEYS,
  taskListQuerySchema,
  updateTaskSchema,
  type TaskListQuery,
} from "@nbs/shared";
import { Router } from "express";
import { authenticate, requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/require-permission";
import { validate, parsedQuery } from "../middleware/validate";
import {
  completeTask,
  createTask,
  deleteTask,
  listTasks,
  updateTask,
} from "../services/tasks.service";

export const tasksRouter = Router();

tasksRouter.use(authenticate, requireAuth);

tasksRouter.get(
  "/",
  requirePermission(PERMISSION_KEYS.TASKS_VIEW),
  validate(taskListQuerySchema, "query"),
  async (req, res) => {
    const result = await listTasks(parsedQuery<TaskListQuery>(req), req.authUser!.id);
    res.json({ data: result });
  },
);

tasksRouter.post(
  "/",
  requirePermission(PERMISSION_KEYS.TASKS_CREATE),
  validate(createTaskSchema),
  async (req, res) => {
    const task = await createTask(req.body);
    res.status(201).json({ data: { task } });
  },
);

tasksRouter.patch(
  "/:id",
  requirePermission(PERMISSION_KEYS.TASKS_UPDATE),
  validate(updateTaskSchema),
  async (req, res) => {
    const task = await updateTask(String(req.params.id), req.body);
    res.json({ data: { task } });
  },
);

tasksRouter.post(
  "/:id/complete",
  requirePermission(PERMISSION_KEYS.TASKS_UPDATE),
  async (req, res) => {
    const task = await completeTask(String(req.params.id));
    res.json({ data: { task } });
  },
);

tasksRouter.delete(
  "/:id",
  requirePermission(PERMISSION_KEYS.TASKS_DELETE),
  async (req, res) => {
    await deleteTask(String(req.params.id));
    res.json({ data: { ok: true } });
  },
);
