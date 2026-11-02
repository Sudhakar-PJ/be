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
 * Notifications Queue: Handles task assignments, system alerts, and transactional emails.
 */
export const notificationsQueue = new Queue(QUEUE_NAMES.NOTIFICATIONS, defaultQueueOptions);

notificationsQueue.on("error", (err: Error) => {
  logger.error({ err: err.message }, "BullMQ notificationsQueue encountered an error");
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

/**
 * Graceful shutdown helper for queues.
 */
export async function closeAllQueues(): Promise<void> {
  logger.info("Closing BullMQ queues...");
  await notificationsQueue.close();
  logger.info("BullMQ queues closed cleanly");
}
