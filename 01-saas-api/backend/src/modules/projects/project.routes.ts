import { Router } from "express";
import { asyncHandler } from "../../lib/asyncHandler";
import { authenticate } from "../../middleware/authenticate";
import { requireRole, requireTenant } from "../../middleware/tenant";
import { validate } from "../../middleware/validate";
import { projectController } from "./project.controller";
import { createProjectSchema, projectIdParamSchema, updateProjectSchema } from "./project.schema";

const projectRouter = Router();

// 1. Guard all project routes: requires valid JWT & valid tenant membership
projectRouter.use(authenticate, requireTenant);

// POST /api/v1/projects (Minimum role: MEMBER)
projectRouter.post(
  "/",
  requireRole("MEMBER"),
  validate(createProjectSchema),
  asyncHandler((req, res) => projectController.createProject(req, res)),
);

// GET /api/v1/projects (Minimum role: VIEWER)
projectRouter.get(
  "/",
  requireRole("VIEWER"),
  asyncHandler((req, res) => projectController.listProjects(req, res)),
);

// GET /api/v1/projects/:id (Minimum role: VIEWER)
projectRouter.get(
  "/:id",
  requireRole("VIEWER"),
  validate(projectIdParamSchema),
  asyncHandler((req, res) => projectController.getProjectById(req, res)),
);

// PATCH /api/v1/projects/:id (Minimum role: MEMBER)
projectRouter.patch(
  "/:id",
  requireRole("MEMBER"),
  validate(updateProjectSchema),
  asyncHandler((req, res) => projectController.updateProject(req, res)),
);

// DELETE /api/v1/projects/:id (Minimum role: ADMIN)
projectRouter.delete(
  "/:id",
  requireRole("ADMIN"),
  validate(projectIdParamSchema),
  asyncHandler((req, res) => projectController.deleteProject(req, res)),
);

export { projectRouter };
