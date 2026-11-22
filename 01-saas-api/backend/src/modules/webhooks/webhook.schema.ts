import { z } from "zod";

/**
 * Platform Event Catalog.
 * Defines all domain events that can be subscribed to by tenant webhooks.
 * Wildcard '*' allows a subscription to receive all platform events.
 */
export const SUPPORTED_WEBHOOK_EVENTS = [
  "*",
  "task.created",
  "task.updated",
  "task.deleted",
  "project.created",
  "project.updated",
  "project.deleted",
] as const;

export type WebhookEvent = (typeof SUPPORTED_WEBHOOK_EVENTS)[number];

/**
 * Validation schema for registering a new webhook subscription.
 */
export const createWebhookSubscriptionSchema = z.object({
  url: z
    .string()
    .url("Invalid URL format")
    .max(2048, "URL must not exceed 2048 characters")
    .refine(
      (val) => {
        try {
          const parsed = new URL(val);
          // In production, strictly enforce HTTPS.
          // Allow HTTP only for local development/testing if needed.
          if (process.env.NODE_ENV === "production") {
            return parsed.protocol === "https:";
          }
          return parsed.protocol === "https:" || parsed.protocol === "http:";
        } catch {
          return false;
        }
      },
      { message: "Webhook endpoint URL must use HTTPS" },
    ),
  events: z
    .array(z.enum(SUPPORTED_WEBHOOK_EVENTS))
    .min(1, "At least one event must be selected")
    .refine(
      (events) => {
        // Prevent duplicate event declarations in the array
        return new Set(events).size === events.length;
      },
      { message: "Duplicate events are not allowed in subscription" },
    ),
});

export type CreateWebhookSubscriptionInput = z.infer<typeof createWebhookSubscriptionSchema>;

/**
 * Validation schema for updating a webhook subscription.
 */
export const updateWebhookSubscriptionSchema = z
  .object({
    url: z
      .string()
      .url("Invalid URL format")
      .max(2048, "URL must not exceed 2048 characters")
      .refine(
        (val) => {
          try {
            const parsed = new URL(val);
            if (process.env.NODE_ENV === "production") {
              return parsed.protocol === "https:";
            }
            return parsed.protocol === "https:" || parsed.protocol === "http:";
          } catch {
            return false;
          }
        },
        { message: "Webhook endpoint URL must use HTTPS" },
      )
      .optional(),
    events: z
      .array(z.enum(SUPPORTED_WEBHOOK_EVENTS))
      .min(1, "At least one event must be selected")
      .refine((events) => new Set(events).size === events.length, {
        message: "Duplicate events are not allowed in subscription",
      })
      .optional(),
    isActive: z.boolean().optional(),
  })
  .refine(
    (data) => data.url !== undefined || data.events !== undefined || data.isActive !== undefined,
    {
      message: "At least one field (url, events, isActive) must be provided for update",
    },
  );

export type UpdateWebhookSubscriptionInput = z.infer<typeof updateWebhookSubscriptionSchema>;

/**
 * Schema for route parameters containing a UUID.
 */
export const webhookIdParamSchema = z.object({
  id: z.string().uuid("Invalid webhook subscription ID format"),
});

export type WebhookIdParam = z.infer<typeof webhookIdParamSchema>;

/**
 * Public response contract for a Webhook Subscription.
 * Note: `secret` is NEVER returned on standard list/get operations.
 * It is only returned once upon initial creation or explicit rotation.
 */
export interface WebhookSubscriptionResponse {
  id: string;
  tenantId: string;
  createdBy: string;
  url: string;
  events: string[];
  isActive: boolean;
  consecutiveFailures: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Extended response contract returned strictly upon creation or secret rotation.
 */
export interface WebhookSubscriptionWithSecretResponse extends WebhookSubscriptionResponse {
  secret: string;
}

/**
 * Delivery log audit response contract.
 */
export interface WebhookDeliveryResponse {
  id: string;
  tenantId: string;
  subscriptionId: string;
  event: string;
  payload: Record<string, unknown>;
  requestHeaders: Record<string, string>;
  responseStatus: number | null;
  responseBody: string | null;
  errorMessage: string | null;
  durationMs: number;
  attemptNumber: number;
  deliveredAt: string;
}

/**
 * Request validation wrappers for Express middleware.
 * Maps body/params/query to match the shape expected by `src/middleware/validate.ts`.
 */
export const createWebhookRequestSchema = z.object({
  body: createWebhookSubscriptionSchema,
});

export const updateWebhookRequestSchema = z.object({
  params: webhookIdParamSchema,
  body: updateWebhookSubscriptionSchema,
});

export const webhookIdParamRequestSchema = z.object({
  params: webhookIdParamSchema,
});
