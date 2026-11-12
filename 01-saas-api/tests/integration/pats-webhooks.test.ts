import http from "http";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { uuidv7 } from "uuidv7";
import { app } from "../../src/app";
import { pool } from "../../src/config/database";
import { notificationsQueue, webhooksQueue } from "../../src/jobs/queues";
import { notificationWorker, webhookWorker } from "../../src/jobs/worker";
import { verifyWebhookSignature } from "../../src/lib/webhook-signature";
import { webhookRepository } from "../../src/modules/webhooks/webhook.repository";
import { WebhookDeliveryService } from "../../src/services/webhook-delivery.service";

interface CapturedWebhookRequest {
  headers: http.IncomingHttpHeaders;
  rawBody: string;
  body: Record<string, unknown>;
}

async function waitFor(
  predicate: () => boolean | Promise<boolean>,
  timeoutMs = 8000,
  intervalMs = 50,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`waitFor timed out after ${timeoutMs}ms`);
}

describe("Milestone 5: PAT Scopes, HMAC Webhooks & Circuit Breaker", { timeout: 30000 }, () => {
  const tenantId = uuidv7();
  const projectId = uuidv7();

  let adminToken: string;
  let adminUserId: string;

  // Local test HTTP server acting as the customer's webhook receiver
  let receiverServer: http.Server;
  let receiverUrl: string;
  let receiverStatus = 200;
  const receivedRequests: CapturedWebhookRequest[] = [];

  beforeAll(async () => {
    // 1. Spin up real local HTTP webhook receiver on a random available port
    receiverServer = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => {
        const rawBody = Buffer.concat(chunks).toString("utf8");
        let parsedBody: Record<string, unknown> = {};
        try {
          parsedBody = JSON.parse(rawBody) as Record<string, unknown>;
        } catch {
          // Keep empty object if non-JSON
        }
        receivedRequests.push({
          headers: req.headers,
          rawBody,
          body: parsedBody,
        });
        res.writeHead(receiverStatus, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ received: true }));
      });
    });

    await new Promise<void>((resolve) => {
      receiverServer.listen(0, "127.0.0.1", () => resolve());
    });
    const address = receiverServer.address();
    if (!address || typeof address === "string") {
      throw new Error("Failed to bind local webhook receiver server");
    }
    receiverUrl = `http://127.0.0.1:${address.port}/hooks`;

    // 2. Seed Tenant, Admin User & Project in PostgreSQL
    await pool.query(`INSERT INTO tenants (id, name, slug) VALUES ($1, 'Webhook Corp', $2)`, [
      tenantId,
      `webhook-corp-${Date.now()}`,
    ]);

    const signupRes = await request(app)
      .post("/api/v1/auth/signup")
      .send({
        email: `wh_admin_${Date.now()}@example.com`,
        password: "StrongPassword123!",
        fullName: "Webhook Admin",
      });

    adminToken = signupRes.body.data.accessToken;
    adminUserId = signupRes.body.data.user.id;

    await pool.query(
      `INSERT INTO tenant_members (tenant_id, user_id, role) VALUES ($1, $2, 'ADMIN')`,
      [tenantId, adminUserId],
    );

    await pool.query(
      `INSERT INTO projects (id, tenant_id, name, key, created_by) VALUES ($1, $2, 'Platform', 'PLAT', $3)`,
      [projectId, tenantId, adminUserId],
    );
  });

  beforeEach(() => {
    receivedRequests.length = 0;
    receiverStatus = 200;
  });

  afterAll(async () => {
    await Promise.all([
      webhookWorker.close(),
      notificationWorker.close(),
      webhooksQueue.close(),
      notificationsQueue.close(),
      new Promise<void>((resolve) => receiverServer.close(() => resolve())),
    ]);
  });

  describe("Personal Access Tokens (PAT) & Scope Boundaries", () => {
    let readOnlyPatId: string;
    let readOnlyRawToken: string;

    it("should mint a PAT with one-time rawToken exposure and omit it from listings", async () => {
      const res = await request(app)
        .post("/api/v1/pats")
        .set("Authorization", `Bearer ${adminToken}`)
        .set("X-Tenant-ID", tenantId)
        .send({
          name: "CI Read-Only Webhooks",
          scopes: ["webhooks:read"],
        });

      expect(res.status).toBe(201);
      expect(res.body.data.pat.rawToken).toMatch(/^pat_live_/);
      readOnlyPatId = res.body.data.pat.id;
      readOnlyRawToken = res.body.data.pat.rawToken;

      const listRes = await request(app)
        .get("/api/v1/pats")
        .set("Authorization", `Bearer ${adminToken}`)
        .set("X-Tenant-ID", tenantId);

      expect(listRes.status).toBe(200);
      const listed = listRes.body.data.pats.find((p: { id: string }) => p.id === readOnlyPatId);
      expect(listed).toBeDefined();
      expect(listed.rawToken).toBeUndefined();
    });

    it("should allow webhooks:read PAT to list webhooks but block webhooks:write (403 INSUFFICIENT_SCOPE)", async () => {
      const listRes = await request(app)
        .get("/api/v1/webhooks")
        .set("Authorization", `Bearer ${readOnlyRawToken}`);

      expect(listRes.status).toBe(200);

      const createRes = await request(app)
        .post("/api/v1/webhooks")
        .set("Authorization", `Bearer ${readOnlyRawToken}`)
        .send({
          url: receiverUrl,
          events: ["task.created"],
        });

      expect(createRes.status).toBe(403);
      expect(createRes.body.code).toBe("INSUFFICIENT_SCOPE");
    });

    it("should block a PAT from minting another PAT via requireUserSession (403 PAT_ACTION_DISALLOWED)", async () => {
      const res = await request(app)
        .post("/api/v1/pats")
        .set("Authorization", `Bearer ${readOnlyRawToken}`)
        .send({
          name: "Nested Escalated Token",
          scopes: ["*"],
        });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe("PAT_ACTION_DISALLOWED");
    });

    it("should immediately reject a revoked PAT with 401 PAT_REVOKED", async () => {
      const revokeRes = await request(app)
        .delete(`/api/v1/pats/${readOnlyPatId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .set("X-Tenant-ID", tenantId);

      expect(revokeRes.status).toBe(204);

      const retryRes = await request(app)
        .get("/api/v1/webhooks")
        .set("Authorization", `Bearer ${readOnlyRawToken}`);

      expect(retryRes.status).toBe(401);
      expect(retryRes.body.code).toBe("PAT_REVOKED");
    });
  });

  describe("End-to-End Webhook Delivery, HMAC Signing & Secret Rotation", () => {
    let subscriptionId: string;
    let signingSecret: string;

    it("should register a webhook, deliver task.created with valid HMAC signature, and reject tampering", async () => {
      const subRes = await request(app)
        .post("/api/v1/webhooks")
        .set("Authorization", `Bearer ${adminToken}`)
        .set("X-Tenant-ID", tenantId)
        .send({
          url: receiverUrl,
          events: ["task.created"],
        });

      expect(subRes.status).toBe(201);
      expect(subRes.body.data.subscription.secret).toMatch(/^whsec_/);
      subscriptionId = subRes.body.data.subscription.id;
      signingSecret = subRes.body.data.subscription.secret;

      const taskRes = await request(app)
        .post("/api/v1/tasks")
        .set("Authorization", `Bearer ${adminToken}`)
        .set("X-Tenant-ID", tenantId)
        .send({
          projectId,
          title: "Verify Outbound HMAC Webhook",
          priority: "HIGH",
        });

      expect(taskRes.status).toBe(201);
      const taskId = taskRes.body.data.task.id;

      await waitFor(() => receivedRequests.length === 1);

      const delivered = receivedRequests[0]!;
      expect(delivered.headers["x-webhook-event"]).toBe("task.created");
      expect(delivered.headers["x-webhook-delivery"]).toBeDefined();
      expect(delivered.body.event).toBe("task.created");
      expect((delivered.body.data as { id: string }).id).toBe(taskId);

      const sigHeader = delivered.headers["x-webhook-signature"] as string;
      expect(verifyWebhookSignature(delivered.rawBody, sigHeader, signingSecret)).toBe(true);

      // Adversarial checks: tampered payload & expired tolerance window
      const tamperedBody = delivered.rawBody.replace("HIGH", "LOW");
      expect(verifyWebhookSignature(tamperedBody, sigHeader, signingSecret)).toBe(false);
      expect(verifyWebhookSignature(delivered.rawBody, sigHeader, signingSecret, -1)).toBe(false);
    });

    it("should invalidate old secret and sign with new secret after rotation", async () => {
      const rotateRes = await request(app)
        .post(`/api/v1/webhooks/${subscriptionId}/rotate-secret`)
        .set("Authorization", `Bearer ${adminToken}`)
        .set("X-Tenant-ID", tenantId);

      expect(rotateRes.status).toBe(200);
      const newSecret = rotateRes.body.data.subscription.secret as string;
      expect(newSecret).toMatch(/^whsec_/);
      expect(newSecret).not.toBe(signingSecret);

      await request(app)
        .post("/api/v1/tasks")
        .set("Authorization", `Bearer ${adminToken}`)
        .set("X-Tenant-ID", tenantId)
        .send({
          projectId,
          title: "Verify Rotated Secret",
        });

      await waitFor(() => receivedRequests.length === 1);

      const delivered = receivedRequests[0]!;
      const sigHeader = delivered.headers["x-webhook-signature"] as string;

      expect(verifyWebhookSignature(delivered.rawBody, sigHeader, signingSecret)).toBe(false);
      expect(verifyWebhookSignature(delivered.rawBody, sigHeader, newSecret)).toBe(true);

      // Clean up active subscription before circuit breaker suite
      await request(app)
        .delete(`/api/v1/webhooks/${subscriptionId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .set("X-Tenant-ID", tenantId);
    });
  });

  describe("Circuit Breaker Deactivation & Delivery Audit Logs", () => {
    it("should auto-deactivate subscription after consecutive failures and record audit logs", async () => {
      const subRes = await request(app)
        .post("/api/v1/webhooks")
        .set("Authorization", `Bearer ${adminToken}`)
        .set("X-Tenant-ID", tenantId)
        .send({
          url: receiverUrl,
          events: ["project.created"],
        });

      expect(subRes.status).toBe(201);
      const brokenSubId = subRes.body.data.subscription.id as string;

      // Simulate permanently dead endpoint (404 triggers immediate UnrecoverableError)
      receiverStatus = 404;
      const fastBreakerService = new WebhookDeliveryService(webhookRepository, 3);

      for (let i = 1; i <= 3; i++) {
        const deliveryId = uuidv7();
        await expect(
          fastBreakerService.deliver(
            {
              correlationId: uuidv7(),
              tenantId,
              enqueuedAt: new Date().toISOString(),
              deliveryId,
              subscriptionId: brokenSubId,
              event: "project.created",
              payload: { id: deliveryId, event: "project.created", data: { attempt: i } },
            },
            1,
            1,
          ),
        ).rejects.toThrow();
      }

      // Verify circuit breaker tripped is_active -> false
      const inspectRes = await request(app)
        .get(`/api/v1/webhooks/${brokenSubId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .set("X-Tenant-ID", tenantId);

      expect(inspectRes.status).toBe(200);
      expect(inspectRes.body.data.subscription.isActive).toBe(false);
      expect(inspectRes.body.data.subscription.consecutiveFailures).toBe(3);

      // 4th delivery attempt must be skipped without hitting receiverServer
      const countBefore = receivedRequests.length;
      await fastBreakerService.deliver(
        {
          correlationId: uuidv7(),
          tenantId,
          enqueuedAt: new Date().toISOString(),
          deliveryId: uuidv7(),
          subscriptionId: brokenSubId,
          event: "project.created",
          payload: { id: uuidv7(), event: "project.created", data: {} },
        },
        1,
        1,
      );
      expect(receivedRequests.length).toBe(countBefore);

      // Verify audit logs captured all 3 404 failures
      const logsRes = await request(app)
        .get(`/api/v1/webhooks/${brokenSubId}/deliveries`)
        .set("Authorization", `Bearer ${adminToken}`)
        .set("X-Tenant-ID", tenantId);

      expect(logsRes.status).toBe(200);
      expect(logsRes.body.data.deliveries).toHaveLength(3);
      expect(logsRes.body.data.deliveries[0].responseStatus).toBe(404);
    });
  });
});
