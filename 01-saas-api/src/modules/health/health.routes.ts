import { Router } from "express";
import { healthController } from "./health.controller";
import { asyncHandler } from "../../lib/asyncHandler";

export const healthRouter = Router();

// Deep probes
healthRouter.get("/live", asyncHandler(healthController.getLive));
healthRouter.get("/ready", asyncHandler(healthController.getReady));

// Root shallow check (backward-compatible)
healthRouter.get("/", healthController.getShallow);
