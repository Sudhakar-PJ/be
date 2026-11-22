import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { uuidv7 } from "uuidv7";
import { app } from "../../src/app";
import { pool } from "../../src/config/database";
import { emailService } from "../../src/services/email.service";
import { notificationsQueue } from "../../src/jobs/queues";
import { notificationWorker } from "../../src/jobs/worker";
import { JobName } from "../../src/jobs/contracts";

/**
 * Helper to poll until an asynchronous condition is satisfied or timeout expires.
 */
async function waitFor(
  predicate: () => boolean | Promise<boolean>,
  timeoutMs = 6000,
  intervalMs = 50,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`waitFor timed out after ${timeoutMs}ms`);
}

describe(
  "Milestone 4: Background Jobs, Retries & Dead Letter Queue (DLQ)",
  { timeout: 30000 },
  () => {
    const tenantId = uuidv7();
    const projectId = uuidv7();

    let memberToken: string;
    let memberUserId: string;

    let assigneeUserId: string;
    const assigneeEmail = `assignee_${Date.now()}@example.com`;

    beforeAll(async () => {
      // 1. Create Tenant in PostgreSQL
      const tenantSlug = `queue-corp-${Date.now()}`;
      await pool.query(`INSERT INTO tenants (id, name, slug) VALUES ($1, 'Queue Corp', $2)`, [
        tenantId,
        tenantSlug,
      ]);

      // 2. Register Member (Creator / Assigner)
      const creatorRes = await request(app)
        .post("/api/v1/auth/signup")
        .send({
          email: `creator_${Date.now()}@example.com`,
          password: "StrongPassword123!",
          fullName: "Sarah Connor",
        });
      memberToken = creatorRes.body.data.accessToken;
      memberUserId = creatorRes.body.data.user.id;

      // 3. Register Assignee
      const assigneeRes = await request(app).post("/api/v1/auth/signup").send({
        email: assigneeEmail,
        password: "StrongPassword123!",
        fullName: "John Connor",
      });
      assigneeUserId = assigneeRes.body.data.user.id;

      // 4. Add both as tenant members
      await pool.query(
        `INSERT INTO tenant_members (tenant_id, user_id, role) VALUES 
       ($1, $2, 'MEMBER'),
       ($1, $3, 'MEMBER')`,
        [tenantId, memberUserId, assigneeUserId],
      );

      // 5. Create a Project
      await pool.query(
        `INSERT INTO projects (id, tenant_id, name, key, created_by) VALUES
       ($1, $2, 'Core Engine', 'CORE', $3)`,
        [projectId, tenantId, memberUserId],
      );
    });

    beforeEach(() => {
      emailService.clearSentEmails();
    });

    afterAll(async () => {
      // Clean up worker and queues cleanly
      await notificationWorker.close();
      await notificationsQueue.close();
    });

    it("should asynchronously dispatch task assignment email via background worker when task is created", async () => {
      // 1. Send HTTP request to create task with assignee
      const res = await request(app)
        .post("/api/v1/tasks")
        .set("Authorization", `Bearer ${memberToken}`)
        .set("X-Tenant-ID", tenantId)
        .send({
          projectId,
          title: "Investigate High Memory Pressure",
          priority: "URGENT",
          assigneeId: assigneeUserId,
        });

      // 2. Express must respond immediately with 201 Created
      expect(res.status).toBe(201);
      expect(res.body.data.task.assigneeId).toBe(assigneeUserId);
      const correlationId = res.headers["x-correlation-id"];
      expect(correlationId).toBeDefined();

      // 3. Wait for the background worker to consume the job from Redis and deliver the email
      await waitFor(() =>
        emailService
          .getSentEmails()
          .some((e) => e.to === assigneeEmail && e.template === "task-assigned"),
      );

      const sent = emailService.getSentEmails();
      const taskEmail = sent.find((e) => e.to === assigneeEmail && e.template === "task-assigned");
      expect(taskEmail).toBeDefined();
      expect(taskEmail?.template).toBe("task-assigned");
      expect(taskEmail?.subject).toContain("Investigate High Memory Pressure");

      // 4. Verify correlationId survived the queue boundary
      expect((taskEmail?.payload as Record<string, unknown>).correlationId).toBe(correlationId);
    });

    it("should retry failed jobs with backoff and succeed on subsequent attempt", async () => {
      let attempts = 0;
      const originalMethod = emailService.sendTaskAssignedEmail.bind(emailService);

      // Force failure on attempt 1, succeed on attempt 2
      emailService.sendTaskAssignedEmail = async (payload) => {
        attempts++;
        if (attempts === 1) {
          throw new Error("Simulated transient 3rd-party network error");
        }
        return originalMethod(payload);
      };

      try {
        // Dispatch a test job with 2 retry attempts and fast backoff (50ms)
        const job = await notificationsQueue.add(
          JobName.TASK_ASSIGNED,
          {
            correlationId: uuidv7(),
            tenantId,
            actorId: memberUserId,
            enqueuedAt: new Date().toISOString(),
            taskId: uuidv7(),
            taskNumber: 99,
            taskTitle: "Retry Resiliency Test",
            projectId,
            assigneeId: assigneeUserId,
            assigneeEmail: "retry_test@example.com",
            assignerName: "Sarah Connor",
          },
          {
            attempts: 2,
            backoff: { type: "fixed", delay: 50 },
          },
        );

        // Wait until the email is delivered after retry
        await waitFor(() =>
          emailService.getSentEmails().some((e) => e.to === "retry_test@example.com"),
        );

        // Verify it failed once and then succeeded
        expect(attempts).toBe(2);

        const state = await job.getState();
        expect(state).toBe("completed");
      } finally {
        // Restore original implementation
        emailService.sendTaskAssignedEmail = originalMethod;
      }
    });

    it("should capture poison-pill jobs in the Dead Letter Queue (DLQ) when all retries are exhausted", async () => {
      const originalMethod = emailService.sendTaskAssignedEmail.bind(emailService);

      // Force permanent failure
      emailService.sendTaskAssignedEmail = async () => {
        throw new Error("Permanent SMTP 550 Invalid Mailbox");
      };

      try {
        // Dispatch a job with only 1 attempt (fails immediately without retry)
        const job = await notificationsQueue.add(
          JobName.TASK_ASSIGNED,
          {
            correlationId: uuidv7(),
            tenantId,
            actorId: memberUserId,
            enqueuedAt: new Date().toISOString(),
            taskId: uuidv7(),
            taskNumber: 100,
            taskTitle: "Poison Pill DLQ Test",
            projectId,
            assigneeId: assigneeUserId,
            assigneeEmail: "poison_pill@example.com",
            assignerName: "Sarah Connor",
          },
          {
            attempts: 1,
          },
        );

        // Wait until the job enters the failed state
        await waitFor(async () => {
          const state = await job.getState();
          return state === "failed";
        });

        // Verify the job was captured in the Dead Letter Queue (failed set)
        const updatedJob = await notificationsQueue.getJob(job.id!);
        expect(updatedJob).toBeDefined();
        expect(await updatedJob?.getState()).toBe("failed");
        expect(updatedJob?.failedReason).toBe("Permanent SMTP 550 Invalid Mailbox");

        // Verify it is inspectable in the DLQ list
        const failedJobs = await notificationsQueue.getFailed();
        const inDlq = failedJobs.find((j) => j.id === job.id);
        expect(inDlq).toBeDefined();
      } finally {
        emailService.sendTaskAssignedEmail = originalMethod;
      }
    });
  },
);
