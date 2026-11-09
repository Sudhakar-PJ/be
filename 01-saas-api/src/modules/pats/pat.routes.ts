import { Router} from "express";
import { asyncHandler } from "../../lib/asyncHandler";

import { authenticate, requireUserSession } from "../../middleware/authenticate";
import { requireRole, requireTenant } from "../../middleware/tenant";
import { validate } from "../../middleware/validate";
import { patController } from "./pat.controller";
import { createPatSchema, patIdParamSchema } from "./pat.schema";

const patRouter = Router();

// Guard all PAT routes with authentication, tenant verification, and session check
patRouter.use(authenticate, requireTenant, requireUserSession);

// POST /api/v1/pats (Minimum role: MEMBER)
patRouter.post(
  "/",
  requireRole("MEMBER"),
  validate(createPatSchema),
  asyncHandler((req, res) => patController.createPat(req, res)),
);

// GET /api/v1/pats (Minimum role: VIEWER)
patRouter.get(
  "/",
  requireRole("VIEWER"),
  asyncHandler((req, res) => patController.listPats(req, res)),
);

// GET /api/v1/pats/:id (Minimum role: VIEWER)
patRouter.get(
  "/:id",
  requireRole("VIEWER"),
  validate(patIdParamSchema),
  asyncHandler((req, res) => patController.getPatById(req, res)),
);

// DELETE /api/v1/pats/:id (Minimum role: MEMBER)
patRouter.delete(
  "/:id",
  requireRole("MEMBER"),
  validate(patIdParamSchema),
  asyncHandler((req, res) => patController.revokePat(req, res)),
);

export { patRouter };