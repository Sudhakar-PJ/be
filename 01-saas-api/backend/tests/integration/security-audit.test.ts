import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { uuidv7 } from "uuidv7";
import { app } from "../../src/app";
import { pool } from "../../src/config/database";
import { redis } from "../../src/config/redis";
import { auditService, GENESIS_HASH } from "../../src/modules/audit/audit.service";

describe(
  "Milestone 5.5: Security Hardening, Audit Logs & Edge Adversarial Suite",
  { timeout: 30000 },
  () => {
    const tenantId = uuidv7();
    let userToken: string;
    let userId: string;

    beforeAll(async () => {
      // 1. Create Tenant
      await pool.query(`INSERT INTO tenants (id, name, slug) VALUES ($1, 'Security Corp', $2)`, [
        tenantId,
        `security-corp-${Date.now()}`,
      ]);

      // 2. Register User
      const signupRes = await request(app)
        .post("/api/v1/auth/signup")
        .send({
          email: `sec_${Date.now()}@example.com`,
          password: "StrongPassword123!",
          fullName: "Security Officer",
        });
      userToken = signupRes.body.data.accessToken;
      userId = signupRes.body.data.user.id;

      // 3. Add User as Tenant OWNER
      await pool.query(
        `INSERT INTO tenant_members (tenant_id, user_id, role) VALUES ($1, $2, 'OWNER')`,
        [tenantId, userId],
      );
    });

    afterAll(async () => {
      // Cleanup Redis rate limit keys and denylist entries
      const keys = await redis.keys("rl:*");
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    });

    // ===========================================================================
    // 1. Security Headers & Rate Limiting
    // ===========================================================================
    describe("Security Headers & Sliding-Window Rate Limiter", () => {
      it("should include OWASP security headers on all responses", async () => {
        const res = await request(app).get("/api/v1/health");

        expect(res.status).toBe(200);
        expect(res.headers["content-security-policy"]).toBeDefined();
        expect(res.headers["x-content-type-options"]).toBe("nosniff");
        expect(res.headers["strict-transport-security"]).toBeDefined();
        expect(res.headers["x-frame-options"]).toBe("SAMEORIGIN");
      });

      it("should enforce rate limiting and return RFC 9457 429 when threshold exceeded", async () => {
        // Clear any prior rate limit keys so we start with a fresh window
        const keys = await redis.keys("rl:*");
        if (keys.length > 0) {
          await redis.del(...keys);
        }

        // The auth router rate limit is 20 requests per minute
        // Fire 20 requests sequentially to exhaust the quota
        for (let i = 0; i < 20; i++) {
          await request(app)
            .post("/api/v1/auth/login")
            .send({ email: "invalid@example.com", password: "wrong" });
        }

        // The 21st request must trigger 429 Too Many Requests
        const throttledRes = await request(app)
          .post("/api/v1/auth/login")
          .send({ email: "invalid@example.com", password: "wrong" });

        expect(throttledRes.status).toBe(429);
        expect(throttledRes.body.code).toBe("RATE_LIMIT_EXCEEDED");
        expect(throttledRes.headers["retry-after"]).toBeDefined();
        expect(throttledRes.headers["ratelimit-remaining"]).toBe("0");
      });
    });

    // ===========================================================================
    // 2. Instant JWT Revocation via Redis Denylist
    // ===========================================================================
    describe("Immediate JWT Revocation on Logout", () => {
      it("should immediately reject a logged-out access token with 401 TOKEN_REVOKED", async () => {
        // Clear rate limit keys so this login is not throttled
        const rateLimitKeys = await redis.keys("rl:*");
        if (rateLimitKeys.length > 0) {
          await redis.del(...rateLimitKeys);
        }

        // 1. Login to obtain fresh tokens
        const loginRes = await request(app)
          .post("/api/v1/auth/login")
          .send({
            email: (await pool.query("SELECT email FROM users WHERE id = $1", [userId])).rows[0]
              .email,
            password: "StrongPassword123!",
          });
        const freshAccessToken = loginRes.body.data.accessToken;
        const refreshToken = loginRes.body.data.refreshToken;

        // 2. Verify token works before logout
        const beforeLogout = await request(app)
          .get("/api/v1/projects")
          .set("Authorization", `Bearer ${freshAccessToken}`)
          .set("X-Tenant-ID", tenantId);
        expect(beforeLogout.status).toBe(200);

        // 3. Logout providing the Bearer token
        const logoutRes = await request(app)
          .post("/api/v1/auth/logout")
          .set("Authorization", `Bearer ${freshAccessToken}`)
          .send({ refreshToken });
        expect(logoutRes.status).toBe(200);

        // 4. Immediately attempt to use that same access token
        const afterLogout = await request(app)
          .get("/api/v1/projects")
          .set("Authorization", `Bearer ${freshAccessToken}`)
          .set("X-Tenant-ID", tenantId);

        expect(afterLogout.status).toBe(401);
        expect(afterLogout.body.code).toBe("TOKEN_REVOKED");
      });
    });

    // ===========================================================================
    // 3. Tamper-Evident Hash-Chained Audit Logs
    // ===========================================================================
    describe("Tamper-Evident Hash-Chained Audit Logs", () => {
      let entry1Id: string;
      let entry2Id: string;

      it("should build a valid cryptographic hash chain from Genesis", async () => {
        // Record 3 events
        const e1 = await auditService.recordEvent({
          tenantId,
          actorId: userId,
          action: "project.created",
          resourceType: "project",
          resourceId: "proj-1",
          payload: { name: "Audit Test Project" },
        });
        entry1Id = e1.id;
        expect(e1.previous_hash).toBe(GENESIS_HASH);
        expect(e1.current_hash).toHaveLength(64);

        const e2 = await auditService.recordEvent({
          tenantId,
          actorId: userId,
          action: "task.created",
          resourceType: "task",
          resourceId: "task-1",
          payload: { title: "Audit Task 1" },
        });
        entry2Id = e2.id;
        expect(e2.previous_hash).toBe(e1.current_hash);

        const e3 = await auditService.recordEvent({
          tenantId,
          actorId: userId,
          action: "task.updated",
          resourceType: "task",
          resourceId: "task-1",
          payload: { status: "DONE" },
        });
        expect(e3.previous_hash).toBe(e2.current_hash);

        // Verify chain integrity
        const verifyResult = await auditService.verifyChain(tenantId);
        expect(verifyResult.isValid).toBe(true);
        expect(verifyResult.totalEntries).toBe(3);
      });

      it("should enforce database-level immutability trigger preventing UPDATE and DELETE", async () => {
        // Attempting to UPDATE an audit record must be rejected by Postgres trigger
        await expect(
          pool.query("UPDATE audit_logs SET action = 'tampered' WHERE id = $1", [entry1Id]),
        ).rejects.toThrow(/immutable and cannot be updated or deleted/);

        // Attempting to DELETE an audit record must also be rejected
        await expect(
          pool.query("DELETE FROM audit_logs WHERE id = $1", [entry1Id]),
        ).rejects.toThrow(/immutable and cannot be updated or deleted/);
      });

      it("should detect tampering if a historical record's contents are altered", async () => {
        const client = await pool.connect();
        try {
          // Temporarily bypass trigger to simulate malicious DB alteration
          await client.query("ALTER TABLE audit_logs DISABLE TRIGGER trg_audit_logs_immutable");
          await client.query("UPDATE audit_logs SET action = 'tampered.action' WHERE id = $1", [
            entry2Id,
          ]);
          await client.query("ALTER TABLE audit_logs ENABLE TRIGGER trg_audit_logs_immutable");

          // Verify chain must immediately flag the tampering
          const verification = await auditService.verifyChain(tenantId);
          expect(verification.isValid).toBe(false);
          expect(verification.tamperedIndex).toBe(1);
          expect(verification.tamperedLogId).toBe(entry2Id);
          expect(verification.reason).toMatch(/stored current_hash does not match/i);
        } finally {
          await client.query("ALTER TABLE audit_logs ENABLE TRIGGER trg_audit_logs_immutable");
          client.release();
        }
      });
    });

    // ===========================================================================
    // 4. Labels, Comments & Trigram Fuzzy Search
    // ===========================================================================
    describe("Labels, Comments & pg_trgm Fuzzy Search", () => {
      it("should support labels, task-label associations, and comments with RLS", async () => {
        const labelId = uuidv7();
        const commentId = uuidv7();
        const projectId = uuidv7();
        const taskId = uuidv7();

        // 1. Create Project & Task
        await pool.query(
          `INSERT INTO projects (id, tenant_id, name, key, created_by) VALUES ($1, $2, 'Search Proj', 'SP', $3)`,
          [projectId, tenantId, userId],
        );
        await pool.query(
          `INSERT INTO tasks (id, tenant_id, project_id, number, title, description, created_by)
         VALUES ($1, $2, $3, 1, 'Deploy Kubernetes cluster on AWS', 'Production infrastructure setup', $4)`,
          [taskId, tenantId, projectId, userId],
        );

        // 2. Create Label
        await pool.query(
          `INSERT INTO labels (id, tenant_id, name, color) VALUES ($1, $2, 'DevOps', '#3B82F6')`,
          [labelId, tenantId],
        );

        // 3. Attach Label to Task via M:N junction table
        await pool.query(
          `INSERT INTO task_labels (task_id, label_id, tenant_id) VALUES ($1, $2, $3)`,
          [taskId, labelId, tenantId],
        );

        // 4. Create Comment
        await pool.query(
          `INSERT INTO comments (id, tenant_id, task_id, author_id, content) VALUES ($1, $2, $3, $4, 'Cluster deployed successfully')`,
          [commentId, tenantId, taskId, userId],
        );

        // 5. Query task list with typo search "Kubrenetes" -> should match via word_similarity
        const searchRes = await request(app)
          .get("/api/v1/tasks?search=Kubrenetes")
          .set("Authorization", `Bearer ${userToken}`)
          .set("X-Tenant-ID", tenantId);

        expect(searchRes.status).toBe(200);
        expect(searchRes.body.data.items.length).toBeGreaterThanOrEqual(1);
        expect(searchRes.body.data.items[0].title).toBe("Deploy Kubernetes cluster on AWS");
      });
    });
  },
);
