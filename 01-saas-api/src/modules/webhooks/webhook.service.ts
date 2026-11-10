import crypto from "crypto";
import { uuidv7 } from "uuidv7";
import { logger } from "../../config/logger";
import { BadRequestError, NotFoundError } from "../../lib/apiError";
import {
  type CreateWebhookSubscriptionInput,
  type UpdateWebhookSubscriptionInput,
  type WebhookSubscriptionResponse,
  type WebhookSubscriptionWithSecretResponse,
  type WebhookDeliveryResponse,
} from "./webhook.schema";
import {
  WebhookRepository,
  webhookRepository,
  toWebhookSubscriptionResponse,
  toWebhookSubscriptionWithSecretResponse,
  toWebhookDeliveryResponse,
} from "./webhook.repository";

export const WEBHOOK_SECRET_PREFIX = "whsec_";

/**
 * Generates a cryptographically secure 256-bit secret for HMAC-SHA256 signing.
 */
export function generateWebhookSecret(): string {
  const entropy = crypto.randomBytes(32).toString("hex");
  return `${WEBHOOK_SECRET_PREFIX}${entropy}`;
}

/**
 * Validates the destination URL to prevent Server-Side Request Forgery (SSRF).
 */
export function validateWebhookUrl(rawUrl: string): void {
  try {
    const parsed = new URL(rawUrl);
    const hostname = parsed.hostname.toLowerCase();

    const blockedHosts = [
      "localhost",
      "127.0.0.1",
      "::1",
      "169.254.169.254", // Cloud instance metadata service (AWS/GCP/Azure)
      "metadata.google.internal",
    ];

    if (process.env.NODE_ENV === "production") {
      if (blockedHosts.includes(hostname)) {
        throw new BadRequestError("Webhook URL cannot target localhost or cloud metadata services");
      }

      // Block RFC 1918 private subnets
      if (
        hostname.startsWith("10.") ||
        hostname.startsWith("192.168.") ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
      ) {
        throw new BadRequestError("Webhook URL cannot target internal private IP ranges");
      }
    }
  } catch (err) {
    if (err instanceof BadRequestError) throw err;
    throw new BadRequestError("Invalid webhook destination URL format");
  }
}

export class WebhookService {
  constructor(private readonly repo: WebhookRepository = webhookRepository) {}

  /**
   * Registers a new webhook subscription and mints its HMAC signing secret.
   */
  async createSubscription(
    tenantId: string,
    userId: string,
    input: CreateWebhookSubscriptionInput,
  ): Promise<WebhookSubscriptionWithSecretResponse> {
    validateWebhookUrl(input.url);

    const subscriptionId = uuidv7();
    const secret = generateWebhookSecret();

    const record = await this.repo.create(tenantId, {
      id: subscriptionId,
      createdBy: userId,
      url: input.url,
      secret,
      events: input.events,
    });

    logger.info(
      {
        subscriptionId,
        tenantId,
        userId,
        url: input.url,
        events: input.events,
      },
      "Webhook subscription created successfully",
    );

    return toWebhookSubscriptionWithSecretResponse(record);
  }

  /**
   * Retrieves a single subscription by ID without the secret.
   */
  async getSubscription(tenantId: string, id: string): Promise<WebhookSubscriptionResponse> {
    const record = await this.repo.findById(tenantId, id);

    if (!record) {
      throw new NotFoundError(`Webhook subscription with ID '${id}' not found`);
    }

    return toWebhookSubscriptionResponse(record);
  }

  /**
   * Lists all subscriptions registered for the tenant.
   */
  async listSubscriptions(tenantId: string): Promise<WebhookSubscriptionResponse[]> {
    const records = await this.repo.findAll(tenantId);
    return records.map(toWebhookSubscriptionResponse);
  }

  /**
   * Updates an existing webhook subscription (e.g. changing events, URL, or toggling active status).
   */
  async updateSubscription(
    tenantId: string,
    id: string,
    input: UpdateWebhookSubscriptionInput,
  ): Promise<WebhookSubscriptionResponse> {
    if (input.url) {
      validateWebhookUrl(input.url);
    }

    // Verify existence first
    const existing = await this.repo.findById(tenantId, id);
    if (!existing) {
      throw new NotFoundError(`Webhook subscription with ID '${id}' not found`);
    }

    const updated = await this.repo.update(tenantId, id, {
      ...(input.url !== undefined && { url: input.url }),
      ...(input.events !== undefined && { events: input.events }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
    });

    if (!updated) {
      throw new NotFoundError(`Webhook subscription with ID '${id}' not found`);
    }

    logger.info(
      { subscriptionId: id, tenantId, updates: input },
      "Webhook subscription updated successfully",
    );

    return toWebhookSubscriptionResponse(updated);
  }

  /**
   * Rotates the HMAC-SHA256 signing secret for a subscription.
   */
  async rotateSecret(tenantId: string, id: string): Promise<WebhookSubscriptionWithSecretResponse> {
    const existing = await this.repo.findById(tenantId, id);
    if (!existing) {
      throw new NotFoundError(`Webhook subscription with ID '${id}' not found`);
    }

    const newSecret = generateWebhookSecret();
    const updated = await this.repo.rotateSecret(tenantId, id, newSecret);

    if (!updated) {
      throw new NotFoundError(`Webhook subscription with ID '${id}' not found`);
    }

    logger.info({ subscriptionId: id, tenantId }, "Webhook signing secret rotated successfully");

    return toWebhookSubscriptionWithSecretResponse(updated);
  }

  /**
   * Permanently deletes a webhook subscription.
   */
  async deleteSubscription(tenantId: string, id: string): Promise<void> {
    const deleted = await this.repo.delete(tenantId, id);

    if (!deleted) {
      throw new NotFoundError(`Webhook subscription with ID '${id}' not found`);
    }

    logger.info({ subscriptionId: id, tenantId }, "Webhook subscription deleted successfully");
  }

  /**
   * Lists recent delivery audit logs for a subscription.
   */
  async listDeliveries(
    tenantId: string,
    subscriptionId: string,
    limit = 20,
  ): Promise<WebhookDeliveryResponse[]> {
    // Verify subscription belongs to this tenant
    const existing = await this.repo.findById(tenantId, subscriptionId);
    if (!existing) {
      throw new NotFoundError(`Webhook subscription with ID '${subscriptionId}' not found`);
    }

    const records = await this.repo.listDeliveries(tenantId, subscriptionId, limit);
    return records.map(toWebhookDeliveryResponse);
  }
}

export const webhookService = new WebhookService();
