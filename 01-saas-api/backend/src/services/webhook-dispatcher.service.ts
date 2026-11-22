import { uuidv7 } from "uuidv7";
import { logger } from "../config/logger";
import { enqueueWebhookDelivery } from "../jobs/queues";
import { getCorrelationId } from "../lib/context";
import { webhookRepository, WebhookRepository } from "../modules/webhooks/webhook.repository";
import { type WebhookEvent } from "../modules/webhooks/webhook.schema";

/**
 * Only concrete domain events can be emitted; wildcard '*' is subscription-only.
 */
export type DispatchableWebhookEvent = Exclude<WebhookEvent, "*">;

export interface DispatchWebhookEventInput {
  tenantId: string;
  actorId?: string | undefined;
  event: DispatchableWebhookEvent;
  data: Record<string, unknown>;
}

export class WebhookDispatcherService {
  constructor(private readonly repo: WebhookRepository = webhookRepository) {}

  /**
   * Queries active tenant subscriptions matching `event` (or '*') and
   * fans out one independent BullMQ delivery job per matching subscription.
   *
   * Never throws into the caller's HTTP transaction: failures are logged
   * with correlation context so primary API mutations stay resilient.
   */
  async dispatch(input: DispatchWebhookEventInput): Promise<void> {
    try {
      const subscribers = await this.repo.findSubscribersForEvent(input.tenantId, input.event);

      if (subscribers.length === 0) {
        return;
      }

      const correlationId = getCorrelationId() ?? uuidv7();
      const occurredAt = new Date().toISOString();

      const results = await Promise.allSettled(
        subscribers.map(async (sub) => {
          const deliveryId = uuidv7();
          const payload: Record<string, unknown> = {
            id: deliveryId,
            event: input.event,
            tenantId: input.tenantId,
            createdAt: occurredAt,
            data: input.data,
          };

          await enqueueWebhookDelivery({
            correlationId,
            tenantId: input.tenantId,
            ...(input.actorId !== undefined ? { actorId: input.actorId } : {}),
            enqueuedAt: occurredAt,
            deliveryId,
            subscriptionId: sub.id,
            event: input.event,
            payload,
          });
        }),
      );

      const failedCount = results.filter((r) => r.status === "rejected").length;
      if (failedCount > 0) {
        logger.error(
          {
            tenantId: input.tenantId,
            event: input.event,
            totalSubscribers: subscribers.length,
            failedCount,
          },
          "One or more webhook delivery jobs failed to enqueue",
        );
      } else {
        logger.debug(
          {
            tenantId: input.tenantId,
            event: input.event,
            subscriberCount: subscribers.length,
          },
          "Fanned out webhook delivery jobs",
        );
      }
    } catch (err) {
      logger.error(
        {
          err,
          tenantId: input.tenantId,
          event: input.event,
        },
        "Failed to dispatch webhook event",
      );
    }
  }
}

export const webhookDispatcherService = new WebhookDispatcherService();
