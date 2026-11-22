import { type Request, type Response } from "express";
import {
  type CreateWebhookSubscriptionInput,
  type UpdateWebhookSubscriptionInput,
} from "./webhook.schema";
import { webhookService, WebhookService } from "./webhook.service";

export class WebhookController {
  constructor(private readonly service: WebhookService = webhookService) {}

  /**
   * POST /api/v1/webhooks
   * Registers a new webhook subscription and reveals its secret.
   */
  async createSubscription(req: Request, res: Response): Promise<void> {
    const tenantId = req.tenant!.id;
    const userId = req.user!.id;
    const body = req.body as CreateWebhookSubscriptionInput;

    const subscription = await this.service.createSubscription(tenantId, userId, body);

    res.status(201).json({
      status: "success",
      data: { subscription },
    });
  }

  /**
   * GET /api/v1/webhooks
   * Lists all webhook subscriptions for the tenant (omitting secrets).
   */
  async listSubscriptions(req: Request, res: Response): Promise<void> {
    const tenantId = req.tenant!.id;

    const subscriptions = await this.service.listSubscriptions(tenantId);

    res.status(200).json({
      status: "success",
      data: { subscriptions },
    });
  }

  /**
   * GET /api/v1/webhooks/:id
   * Retrieves subscription metadata by ID.
   */
  async getSubscription(req: Request, res: Response): Promise<void> {
    const tenantId = req.tenant!.id;
    const id = req.params.id as string;

    const subscription = await this.service.getSubscription(tenantId, id);

    res.status(200).json({
      status: "success",
      data: { subscription },
    });
  }

  /**
   * PATCH /api/v1/webhooks/:id
   * Updates endpoint URL, subscribed events, or active status.
   */
  async updateSubscription(req: Request, res: Response): Promise<void> {
    const tenantId = req.tenant!.id;
    const id = req.params.id as string;
    const body = req.body as UpdateWebhookSubscriptionInput;

    const subscription = await this.service.updateSubscription(tenantId, id, body);

    res.status(200).json({
      status: "success",
      data: { subscription },
    });
  }

  /**
   * POST /api/v1/webhooks/:id/rotate-secret
   * Generates a new HMAC signing secret and returns it.
   */
  async rotateSecret(req: Request, res: Response): Promise<void> {
    const tenantId = req.tenant!.id;
    const id = req.params.id as string;

    const subscription = await this.service.rotateSecret(tenantId, id);

    res.status(200).json({
      status: "success",
      data: { subscription },
    });
  }

  /**
   * DELETE /api/v1/webhooks/:id
   * Deletes a subscription permanently.
   */
  async deleteSubscription(req: Request, res: Response): Promise<void> {
    const tenantId = req.tenant!.id;
    const id = req.params.id as string;

    await this.service.deleteSubscription(tenantId, id);

    res.status(204).send();
  }

  /**
   * GET /api/v1/webhooks/:id/deliveries
   * Lists recent delivery audit logs for a subscription.
   */
  async listDeliveries(req: Request, res: Response): Promise<void> {
    const tenantId = req.tenant!.id;
    const id = req.params.id as string;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;

    const deliveries = await this.service.listDeliveries(tenantId, id, limit);

    res.status(200).json({
      status: "success",
      data: { deliveries },
    });
  }
}

export const webhookController = new WebhookController();
