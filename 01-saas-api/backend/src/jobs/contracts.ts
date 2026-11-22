import { z } from "zod";

/**
 * Common metadata envelope required for all asynchronous jobs.
 * Ensures distributed tracing (correlationId) and multi-tenancy (tenantId)
 * survive across process and queue boundaries.
 */
export const JobMetadataSchema = z.object({
  correlationId: z.string().uuid(),
  tenantId: z.string().uuid().optional(),
  actorId: z.string().uuid().optional(),
  enqueuedAt: z.string().datetime(),
});
export type JobMetadata = z.infer<typeof JobMetadataSchema>;

/**
 * Job names for queues.
 */
export const JobName = {
  TASK_ASSIGNED: "task:assigned",
  WELCOME_EMAIL: "email:welcome",
  WEBHOOK_DELIVERY: "webhook:delivery",
} as const;

export type JobNameType = (typeof JobName)[keyof typeof JobName];

/**
 * Task Assigned Job Payload
 */
export const TaskAssignedPayloadSchema = JobMetadataSchema.extend({
  tenantId: z.string().uuid(),
  taskId: z.string().uuid(),
  taskNumber: z.number().int().positive(),
  taskTitle: z.string().min(1),
  projectId: z.string().uuid(),
  assigneeId: z.string().uuid(),
  assigneeEmail: z.string().email(),
  assignerName: z.string().min(1),
});
export type TaskAssignedPayload = z.infer<typeof TaskAssignedPayloadSchema>;

/**
 * Welcome Email Job Payload
 */
export const WelcomeEmailPayloadSchema = JobMetadataSchema.extend({
  userId: z.string().uuid(),
  email: z.string().email(),
  name: z.string().min(1),
});
export type WelcomeEmailPayload = z.infer<typeof WelcomeEmailPayloadSchema>;

/**
 * Outbound Webhook Delivery Job Payload.
 * Note: We intentionally do NOT put the plaintext `secret` or `url` inside Redis
 * unless needed; instead, the worker fetches fresh subscription state from Postgres
 * so revoked/disabled/rotated subscriptions take effect immediately!
 */
export const WebhookDeliveryPayloadSchema = JobMetadataSchema.extend({
  tenantId: z.string().uuid(),
  deliveryId: z.string().uuid(),
  subscriptionId: z.string().uuid(),
  event: z.string().min(1),
  payload: z.record(z.unknown()),
});
export type WebhookDeliveryPayload = z.infer<typeof WebhookDeliveryPayloadSchema>;

/**
 * Queue Names in BullMQ
 */
export const QUEUE_NAMES = {
  NOTIFICATIONS: "notifications",
  WEBHOOKS: "webhooks",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];
