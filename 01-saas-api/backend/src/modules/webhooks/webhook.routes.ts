import { Router } from "express";
import { asyncHandler } from "../../lib/asyncHandler";
import { authenticate, requireScope } from "../../middleware/authenticate";
import { requireRole, requireTenant } from "../../middleware/tenant";
import { validate } from "../../middleware/validate";
import { webhookController } from "./webhook.controller";
import {
  createWebhookRequestSchema,
  updateWebhookRequestSchema,
  webhookIdParamRequestSchema,
} from "./webhook.schema";

const webhookRouter = Router();

// Base guards: authenticate -> requireTenant -> requireRole("ADMIN")
webhookRouter.use(authenticate, requireTenant, requireRole("ADMIN"));

// POST /api/v1/webhooks (Register new subscription)
webhookRouter.post(
  "/",
  requireScope("webhooks:write"),
  validate(createWebhookRequestSchema),
  asyncHandler((req, res) => webhookController.createSubscription(req, res)),
);

// GET /api/v1/webhooks (List all subscriptions)
webhookRouter.get(
  "/",
  requireScope("webhooks:read"),
  asyncHandler((req, res) => webhookController.listSubscriptions(req, res)),
);

// GET /api/v1/webhooks/:id (Inspect single subscription)
webhookRouter.get(
  "/:id",
  requireScope("webhooks:read"),
  validate(webhookIdParamRequestSchema),
  asyncHandler((req, res) => webhookController.getSubscription(req, res)),
);

// PATCH /api/v1/webhooks/:id (Update subscription)
webhookRouter.patch(
  "/:id",
  requireScope("webhooks:write"),
  validate(updateWebhookRequestSchema),
  asyncHandler((req, res) => webhookController.updateSubscription(req, res)),
);

// POST /api/v1/webhooks/:id/rotate-secret (Rotate HMAC signing secret)
webhookRouter.post(
  "/:id/rotate-secret",
  requireScope("webhooks:write"),
  validate(webhookIdParamRequestSchema),
  asyncHandler((req, res) => webhookController.rotateSecret(req, res)),
);

// DELETE /api/v1/webhooks/:id (Delete subscription)
webhookRouter.delete(
  "/:id",
  requireScope("webhooks:write"),
  validate(webhookIdParamRequestSchema),
  asyncHandler((req, res) => webhookController.deleteSubscription(req, res)),
);

// GET /api/v1/webhooks/:id/deliveries (Inspect delivery audit log)
webhookRouter.get(
  "/:id/deliveries",
  requireScope("webhooks:read"),
  validate(webhookIdParamRequestSchema),
  asyncHandler((req, res) => webhookController.listDeliveries(req, res)),
);

export { webhookRouter };
