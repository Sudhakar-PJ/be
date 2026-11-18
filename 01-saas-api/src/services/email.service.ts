import { logger } from "../config/logger";
import { TaskAssignedPayload, WelcomeEmailPayload } from "../jobs/contracts";
import { emailsSentTotal, emailSendDurationSeconds } from "../metrics/queue.metrics";

export interface SentEmailRecord {
  to: string;
  subject: string;
  template: "task-assigned" | "welcome-email";
  payload: Record<string, unknown>;
  sentAt: Date;
}

export interface IEmailService {
  sendTaskAssignedEmail(payload: TaskAssignedPayload): Promise<void>;
  sendWelcomeEmail(payload: WelcomeEmailPayload): Promise<void>;
}

/**
 * In-memory Mock Email Service for Development & Automated Testing.
 * Stores dispatched emails in an array for test assertions.
 */
class MockEmailService implements IEmailService {
  private sentEmails: SentEmailRecord[] = [];

  async sendTaskAssignedEmail(payload: TaskAssignedPayload): Promise<void> {
    const start = process.hrtime.bigint();
    const subject = `[Task #${payload.taskNumber}] Assigned: ${payload.taskTitle}`;

    try {
      // Simulate network roundtrip latency
      await new Promise((resolve) => setTimeout(resolve, 50));

      this.sentEmails.push({
        to: payload.assigneeEmail,
        subject,
        template: "task-assigned",
        payload: { ...payload },
        sentAt: new Date(),
      });

      const durationSec = Number(process.hrtime.bigint() - start) / 1e9;
      emailSendDurationSeconds.observe({ template: "task-assigned" }, durationSec);
      emailsSentTotal.inc({ template: "task-assigned", status: "success" });

      logger.info(
        {
          to: payload.assigneeEmail,
          taskId: payload.taskId,
          taskNumber: payload.taskNumber,
          subject,
        },
        "📧 [EMAIL DISPATCHED] Task assignment notification delivered",
      );
    } catch (err) {
      const durationSec = Number(process.hrtime.bigint() - start) / 1e9;
      emailSendDurationSeconds.observe({ template: "task-assigned" }, durationSec);
      emailsSentTotal.inc({ template: "task-assigned", status: "failure" });
      throw err;
    }
  }

  async sendWelcomeEmail(payload: WelcomeEmailPayload): Promise<void> {
    const start = process.hrtime.bigint();
    const subject = `Welcome to the Platform, ${payload.name}!`;

    try {
      await new Promise((resolve) => setTimeout(resolve, 50));

      this.sentEmails.push({
        to: payload.email,
        subject,
        template: "welcome-email",
        payload: { ...payload },
        sentAt: new Date(),
      });

      const durationSec = Number(process.hrtime.bigint() - start) / 1e9;
      emailSendDurationSeconds.observe({ template: "welcome-email" }, durationSec);
      emailsSentTotal.inc({ template: "welcome-email", status: "success" });

      logger.info(
        {
          to: payload.email,
          name: payload.name,
          subject,
        },
        "📧 [EMAIL DISPATCHED] Welcome email delivered",
      );
    } catch (err) {
      const durationSec = Number(process.hrtime.bigint() - start) / 1e9;
      emailSendDurationSeconds.observe({ template: "welcome-email" }, durationSec);
      emailsSentTotal.inc({ template: "welcome-email", status: "failure" });
      throw err;
    }
  }

  /**
   * Test assertion helpers
   */
  getSentEmails(): readonly SentEmailRecord[] {
    return [...this.sentEmails];
  }

  clearSentEmails(): void {
    this.sentEmails = [];
  }
}

export const emailService = new MockEmailService();
