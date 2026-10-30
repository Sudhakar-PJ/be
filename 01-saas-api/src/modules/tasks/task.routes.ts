import { Router } from "express";
import { asyncHandler } from "../../lib/asyncHandler";
import { authenticate } from "../../middleware/authenticate";
import { idempotency } from "../../middleware/idempotency";
import { requireRole, requireTenant } from "../../middleware/tenant";
import { validate } from "../../middleware/validate";
import { taskController } from "./task.controller";
import {
  createTaskSchema,
  listTasksQuerySchema,
  taskIdParamSchema,
  updateTaskSchema,
} from "./task.schema";

const taskRouter = Router();

// 1. Guard all task routes: requires valid JWT & valid workspace membership
taskRouter.use(authenticate, requireTenant);

// POST /api/v1/tasks (Minimum role: MEMBER, with Redis Idempotency)
taskRouter.post(
  "/",
  requireRole("MEMBER"),
  idempotency({ required: false }),
  validate(createTaskSchema),
  asyncHandler((req, res) => taskController.createTask(req, res)),
);

// GET /api/v1/tasks (Minimum role: VIEWER, supports keyset pagination & search)
taskRouter.get(
  "/",
  requireRole("VIEWER"),
  validate(listTasksQuerySchema),
  asyncHandler((req, res) => taskController.listTasks(req, res)),
);

// GET /api/v1/tasks/:id (Minimum role: VIEWER)
taskRouter.get(
  "/:id",
  requireRole("VIEWER"),
  validate(taskIdParamSchema),
  asyncHandler((req, res) => taskController.getTaskById(req, res)),
);

// PATCH /api/v1/tasks/:id (Minimum role: MEMBER, enforces Optimistic Locking)
taskRouter.patch(
  "/:id",
  requireRole("MEMBER"),
  validate(updateTaskSchema),
  asyncHandler((req, res) => taskController.updateTask(req, res)),
);

// DELETE /api/v1/tasks/:id (Minimum role: ADMIN)
taskRouter.delete(
  "/:id",
  requireRole("ADMIN"),
  validate(taskIdParamSchema),
  asyncHandler((req, res) => taskController.deleteTask(req, res)),
);

export { taskRouter };
