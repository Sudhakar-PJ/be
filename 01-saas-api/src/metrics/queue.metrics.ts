import client from "@prometheus-io/client";
import { register } from "./registry";

/**
 * BullMQ Jobs Enqueued Counter.
 * Measures background job dispatch velocity partitioned by queue and job type.
 */
export const bullmqJobsEnqueuedTotal = new client.Counter({
  name: "bullmq_jobs_enqueued_total",
  help: "Total number of background jobs enqueued into BullMQ",
  labelNames: ["queue", "job_name"] as const,
  registers: [register],
});

/**
 * BullMQ Job Execution Duration Histogram.
 * Tracks worker execution latency partitioned by queue, job type, and terminal outcome.
 */
export const bullmqJobDurationSeconds = new client.Histogram({
  name: "bullmq_job_duration_seconds",
  help: "Execution duration of BullMQ background jobs in seconds",
  labelNames: ["queue", "job_name", "status"] as const, // status: 'completed' | 'failed'
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

/**
 * Transactional Emails Sent Counter.
 * Measures outbound email volume partitioned by template and delivery status.
 */
export const emailsSentTotal = new client.Counter({
  name: "emails_sent_total",
  help: "Total number of transactional emails dispatched",
  labelNames: ["template", "status"] as const, // status: 'success' | 'failure'
  registers: [register],
});

/**
 * Email Dispatch Duration Histogram.
 * Measures network roundtrip latency communicating with external email provider (e.g. SMTP/SendGrid).
 */
export const emailSendDurationSeconds = new client.Histogram({
  name: "email_send_duration_seconds",
  help: "Duration of transactional email dispatch operations in seconds",
  labelNames: ["template"] as const,
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
  registers: [register],
});
