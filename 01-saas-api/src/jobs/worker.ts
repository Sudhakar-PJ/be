import { Worker, Job } from "bullmq";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { asyncLocalStorage } from "../lib/context";
import { emailService } from "../services/email.service";
import {
  QUEUE_NAMES,
  JobName,
  TaskAssignedPayload,
  TaskAssignedPayloadSchema,
  WelcomeEmailPayload,
  WelcomeEmailPayloadSchema,
} from "./contracts";

/**
 * Worker Processor: Routes incoming jobs to the appropriate domain service.
 * Enforces AsyncLocalStorage context re-hydration so that all downstream
 * logging carries the originating HTTP request's correlationId and tenantId.
 */
export async function processNotificationJob(job: Job): Promise<void> {
  const metadata = {
    correlationId: (job.data as { correlationId?: string }).correlationId ?? "unknown",
    tenantId: (job.data as { tenantId?: string }).tenantId ?? "unknown",
    userId: (job.data as { actorId?: string }).actorId,
  };

  // Re-hydrate AsyncLocalStorage boundary for this job execution
  await asyncLocalStorage.run(metadata, async () => {
    logger.info(
      {
        jobId: job.id,
        jobName: job.name,
        attempt: job.attemptsMade + 1,
      },
      "Processing background job",
    );

    switch (job.name) {
      case JobName.TASK_ASSIGNED: {
        const payload: TaskAssignedPayload = TaskAssignedPayloadSchema.parse(job.data);
        await emailService.sendTaskAssignedEmail(payload);
        break;
      }

      case JobName.WELCOME_EMAIL: {
        const payload: WelcomeEmailPayload = WelcomeEmailPayloadSchema.parse(job.data);
        await emailService.sendWelcomeEmail(payload);
        break;
      }

      default:
        logger.error({ jobName: job.name, jobId: job.id }, "Unrecognized job name encountered");
        throw new Error(`Unrecognized job name: ${job.name}`);
    }

    logger.info({ jobId: job.id, jobName: job.name }, "Background job processed successfully");
  });
}

/**
 * Worker instance configuration:
 * - concurrency: 5 parallel jobs per worker instance
 * - connects directly to Redis using env.REDIS_URL
 */
export const notificationWorker = new Worker(QUEUE_NAMES.NOTIFICATIONS, processNotificationJob, {
  connection: {
    url: env.REDIS_URL,
    maxRetriesPerRequest: null,
  },
  concurrency: 5,
});

// Worker Lifecycle Event Listeners
notificationWorker.on("completed", (job: Job) => {
  logger.info({ jobId: job.id, jobName: job.name }, "Worker: Job completed");
});

notificationWorker.on("failed", (job: Job | undefined, err: Error) => {
  logger.error(
    {
      jobId: job?.id,
      jobName: job?.name,
      attempt: job ? job.attemptsMade : "unknown",
      err: err.message,
    },
    "Worker: Job attempt failed",
  );
});

notificationWorker.on("error", (err: Error) => {
  logger.error({ err: err.message }, "Worker encountered a critical error");
});

/**
 * Standalone Worker Process Runner & Graceful Shutdown
 */
export async function startWorker(): Promise<void> {
  logger.info("🚀 Background Worker process initialized and waiting for jobs...");

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "Shutting down worker gracefully...");
    try {
      await notificationWorker.close();
      logger.info("Worker closed cleanly");
      process.exit(0);
    } catch (err) {
      logger.error({ err }, "Error during worker shutdown");
      process.exit(1);
    }
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

// Auto-start worker when run directly from CLI (e.g. `npm run worker`)
if (require.main === module) {
  startWorker().catch((err) => {
    logger.fatal({ err }, "Fatal worker startup failure");
    process.exit(1);
  });
}
