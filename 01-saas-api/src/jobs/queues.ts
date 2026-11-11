import { Queue, QueueOptions, JobsOptions } from "bullmq";
import { env } from "../config/env";
import { logger } from "../config/logger";
import {
  QUEUE_NAMES,
  JobName,
  TaskAssignedPayload,
  TaskAssignedPayloadSchema,
  WelcomeEmailPayload,
  WelcomeEmailPayloadSchema,
  WebhookDeliveryPayload,
  WebhookDeliveryPayloadSchema,
} from "./contracts";

/**
 * Default options applied to every job in the queue:
 * - 5 retry attempts with exponential backoff
 * - Initial retry delay of 1,000ms (1s -> 2s -> 4s -> 8s -> 16s)
 * - Automatic retention cleanup to prevent Redis memory bloat
 */
export const defaultJobOptions: JobsOptions = {
  attempts: 5,
  backoff: {
    type: "exponential",
    delay: 1000,
  },
  removeOnComplete: {
    count: 1000,
    age: 24 * 3600, // 24 hours
  },
  removeOnFail: {
    count: 5000, // Retain 5,000 failed jobs for Dead Letter Queue inspection
  },
};

const defaultQueueOptions: QueueOptions = {
  connection: {
    url: env.REDIS_URL,
    maxRetriesPerRequest: null,
  },
  defaultJobOptions,
};

/**
 * Webhook-specific backoff options:
 * - 5 attempts with exponential backoff + jitter (prevents thundering herds)
 * - Initial delay of 5,000ms (~5s -> 10s -> 20s -> 40s -> 80s)
 */
export const webhookJobOptions: JobsOptions = {
  attempts: 5,
  backoff: {
    type: "exponential",
    delay: 5000,
    jitter: 0.2,
  },
  removeOnComplete: {
    count: 1000,
    age: 24 * 3600,
  },
  removeOnFail: {
    count: 5000,
  },
};

const webhookQueueOptions: QueueOptions = {
  connection: {
    url: env.REDIS_URL,
    maxRetriesPerRequest: null,
  },
  defaultJobOptions: webhookJobOptions,
};

/**
 * Notifications Queue: Handles task assignments, system alerts, and transactional emails.
 */
export const notificationsQueue = new Queue(QUEUE_NAMES.NOTIFICATIONS, defaultQueueOptions);

notificationsQueue.on("error", (err: Error) => {
  logger.error({ err: err.message }, "BullMQ notificationsQueue encountered an error");
});

/**
 * Webhooks Queue: Isolated bulkhead queue for outbound third-party HTTP webhook deliveries.
 */
export const webhooksQueue = new Queue(QUEUE_NAMES.WEBHOOKS, webhookQueueOptions);
webhooksQueue.on("error", (err: Error) => {
  logger.error({ err: err.message }, "BullMQ webhooksQueue encountered an error");
});

/**
 * Type-safe dispatcher helpers.
 * Validates payload schema with Zod BEFORE pushing to Redis to fail-fast on the API side.
 */
export async function enqueueTaskAssignedNotification(payload: TaskAssignedPayload): Promise<void> {
  const validated = TaskAssignedPayloadSchema.parse(payload);
  await notificationsQueue.add(JobName.TASK_ASSIGNED, validated);
  logger.debug(
    { taskId: validated.taskId, assigneeEmail: validated.assigneeEmail },
    "Enqueued task:assigned job",
  );
}

export async function enqueueWelcomeEmail(payload: WelcomeEmailPayload): Promise<void> {
  const validated = WelcomeEmailPayloadSchema.parse(payload);
  await notificationsQueue.add(JobName.WELCOME_EMAIL, validated);
  logger.debug({ email: validated.email }, "Enqueued email:welcome job");
}

export async function enqueueWebhookDelivery(
  payload: WebhookDeliveryPayload,
  options?: JobsOptions,
): Promise<void> {
  const validated = WebhookDeliveryPayloadSchema.parse(payload);
  await webhooksQueue.add(JobName.WEBHOOK_DELIVERY, validated, {
    jobId: validated.deliveryId, // Deduplicates duplicate enqueue attempts for the same deliveryId
    ...options,
  });
  logger.debug(
    {
      deliveryId: validated.deliveryId,
      subscriptionId: validated.subscriptionId,
      event: validated.event,
    },
    "Enqueued webhook:delivery job",
  );
}

/**
 * Graceful shutdown helper for queues.
 */
export async function closeAllQueues(): Promise<void> {
  logger.info("Closing BullMQ queues...");
  await notificationsQueue.close();
  logger.info("BullMQ queues closed cleanly");
}
