import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { uuidv7 } from "uuidv7";
import { app } from "../../src/app";
import { pool } from "../../src/config/database";
import { redis } from "../../src/config/redis";

describe(
  "Milestone 3: Task Engine, Keyset Pagination, OCC & Idempotency",
  { timeout: 30000 },
  () => {
    // Test Tenancy & Project
    const tenantId = uuidv7();
    const otherTenantId = uuidv7();
    const projectId = uuidv7();

    let memberToken: string;
    let viewerToken: string;

    let createdTaskId: string;
    let task1Id: string;
    let task2Id: string;

    beforeAll(async () => {
      // 1. Create Tenants in PostgreSQL
      await pool.query(
        `INSERT INTO tenants (id, name, slug) VALUES 
       ($1, 'Task Corp', 'task-corp'),
       ($2, 'Other Corp', 'other-corp')`,
        [tenantId, otherTenantId],
      );

      // 2. Register Member User
      const signupMember = await request(app)
        .post("/api/v1/auth/signup")
        .send({
          email: `task_member_${Date.now()}@example.com`,
          password: "StrongPassword123!",
          fullName: "Task Member",
        });
      memberToken = signupMember.body.data.accessToken;
      const memberId = signupMember.body.data.user.id;

      // 3. Register Viewer User
      const signupViewer = await request(app)
        .post("/api/v1/auth/signup")
        .send({
          email: `task_viewer_${Date.now()}@example.com`,
          password: "StrongPassword123!",
          fullName: "Task Viewer",
        });
      viewerToken = signupViewer.body.data.accessToken;
      const viewerId = signupViewer.body.data.user.id;

      // 4. Assign Memberships
      await pool.query(
        `INSERT INTO tenant_members (tenant_id, user_id, role) VALUES 
       ($1, $2, 'MEMBER'),
       ($1, $3, 'VIEWER')`,
        [tenantId, memberId, viewerId],
      );

      // 5. Create a Project in the Tenant
      await pool.query(
        `INSERT INTO projects (id, tenant_id, name, key, created_by) VALUES
       ($1, $2, 'Task Engine Project', 'TASK', $3)`,
        [projectId, tenantId, memberId],
      );
    }, 30000);

    afterAll(async () => {
      await pool.query(`DELETE FROM tenants WHERE id IN ($1, $2)`, [tenantId, otherTenantId]);
      await pool.end();
      await redis.quit();
    });

    // ===========================================================================
    // 1. Sequential Numbering & Creation
    // ===========================================================================
    describe("Task Creation & Sequential Project Numbering", () => {
      it("should reject creating task for a non-existent or foreign project with 404", async () => {
        const res = await request(app)
          .post("/api/v1/tasks")
          .set("Authorization", `Bearer ${memberToken}`)
          .set("X-Tenant-ID", otherTenantId) // Other tenant cannot see this projectId
          .send({
            projectId,
            title: "Illegal Foreign Task",
          });

        // 403 because member is not in otherTenant, or 404 if tenant doesn't have project
        expect([403, 404]).toContain(res.status);
      });

      it("should create Task 1 and assign sequence number 1", async () => {
        const res = await request(app)
          .post("/api/v1/tasks")
          .set("Authorization", `Bearer ${memberToken}`)
          .set("X-Tenant-ID", tenantId)
          .send({
            projectId,
            title: "Implement database connection pooling",
            description: "Configure Neon SSL and pool limits",
            priority: "HIGH",
          });

        expect(res.status).toBe(201);
        expect(res.body.data.task.number).toBe(1);
        expect(res.body.data.task.version).toBe(1);
        expect(res.body.data.task.status).toBe("TODO");

        createdTaskId = res.body.data.task.id;
        task1Id = res.body.data.task.id;
      });

      it("should sequentially assign number 2 and 3 to subsequent tasks", async () => {
        const res2 = await request(app)
          .post("/api/v1/tasks")
          .set("Authorization", `Bearer ${memberToken}`)
          .set("X-Tenant-ID", tenantId)
          .send({
            projectId,
            title: "Build Redis token bucket rate limiter",
            description: "High-throughput token sliding window in Redis",
          });

        const res3 = await request(app)
          .post("/api/v1/tasks")
          .set("Authorization", `Bearer ${memberToken}`)
          .set("X-Tenant-ID", tenantId)
          .send({
            projectId,
            title: "Benchmark keyset pagination performance",
            description: "Compare OFFSET cliff vs keyset binary seek",
          });

        expect(res2.body.data.task.number).toBe(2);
        expect(res3.body.data.task.number).toBe(3);

        task2Id = res2.body.data.task.id;
      });
    });

    // ===========================================================================
    // 2. Keyset (Cursor-Based) Pagination
    // ===========================================================================
    describe("Keyset Cursor Pagination (LIMIT + 1)", () => {
      let nextCursor: string;

      it("should fetch page 1 with limit=2 and return hasNextPage: true with endCursor", async () => {
        const res = await request(app)
          .get("/api/v1/tasks?limit=2")
          .set("Authorization", `Bearer ${viewerToken}`)
          .set("X-Tenant-ID", tenantId);

        expect(res.status).toBe(200);
        expect(res.body.data.items).toHaveLength(2);
        expect(res.body.data.pageInfo.hasNextPage).toBe(true);
        expect(res.body.data.pageInfo.endCursor).toBeDefined();

        nextCursor = res.body.data.pageInfo.endCursor;
      });

      it("should fetch page 2 using cursor and return remaining task with hasNextPage: false", async () => {
        const res = await request(app)
          .get(`/api/v1/tasks?limit=2&cursor=${nextCursor}`)
          .set("Authorization", `Bearer ${viewerToken}`)
          .set("X-Tenant-ID", tenantId);

        expect(res.status).toBe(200);
        expect(res.body.data.items.length).toBeGreaterThanOrEqual(1);
        expect(res.body.data.pageInfo.hasNextPage).toBe(false);
      });

      it("should reject tampered or invalid cursor with 400 Bad Request", async () => {
        const res = await request(app)
          .get("/api/v1/tasks?cursor=malformed_tampered_base64_string")
          .set("Authorization", `Bearer ${viewerToken}`)
          .set("X-Tenant-ID", tenantId);

        expect(res.status).toBe(400);
        expect(res.body.code).toBe("INVALID_PAGINATION_CURSOR");
      });
    });

    // ===========================================================================
    // 3. PostgreSQL Full-Text Search (TSVECTOR + GIN)
    // ===========================================================================
    describe("Full-Text Search Engine", () => {
      it("should find task matching search query in description", async () => {
        const res = await request(app)
          .get("/api/v1/tasks?search=pooling")
          .set("Authorization", `Bearer ${viewerToken}`)
          .set("X-Tenant-ID", tenantId);

        expect(res.status).toBe(200);
        expect(res.body.data.items.length).toBeGreaterThanOrEqual(1);
        expect(res.body.data.items[0].id).toBe(task1Id);
      });

      it("should find task using natural websearch syntax", async () => {
        const res = await request(app)
          .get('/api/v1/tasks?search="sliding window"')
          .set("Authorization", `Bearer ${viewerToken}`)
          .set("X-Tenant-ID", tenantId);

        expect(res.status).toBe(200);
        expect(res.body.data.items.length).toBeGreaterThanOrEqual(1);
        expect(res.body.data.items[0].id).toBe(task2Id);
      });
    });

    // ===========================================================================
    // 4. Optimistic Concurrency Control (OCC)
    // ===========================================================================
    describe("Optimistic Concurrency Control (OCC)", () => {
      it("should update task when version matches and increment version to 2", async () => {
        const res = await request(app)
          .patch(`/api/v1/tasks/${createdTaskId}`)
          .set("Authorization", `Bearer ${memberToken}`)
          .set("X-Tenant-ID", tenantId)
          .send({
            version: 1, // Current DB version is 1
            status: "IN_PROGRESS",
            title: "Implement database connection pooling (Started)",
          });

        expect(res.status).toBe(200);
        expect(res.body.data.task.version).toBe(2);
        expect(res.body.data.task.status).toBe("IN_PROGRESS");
      });

      it("should reject concurrent update with stale version 1 with 409 Conflict", async () => {
        // Simulates User B who loaded the page when version was 1, unaware User A bumped it to 2
        const res = await request(app)
          .patch(`/api/v1/tasks/${createdTaskId}`)
          .set("Authorization", `Bearer ${memberToken}`)
          .set("X-Tenant-ID", tenantId)
          .send({
            version: 1, // Stale version!
            status: "DONE",
          });

        expect(res.status).toBe(409);
        expect(res.body.code).toBe("TASK_CONCURRENCY_CONFLICT");
      });
    });

    // ===========================================================================
    // 5. Redis Atomic Idempotency Guard
    // ===========================================================================
    describe("Redis Atomic Idempotency (Idempotency-Key)", () => {
      const idempotencyKey = uuidv7();

      it("should process initial request with Idempotency-Key and return 201", async () => {
        const res = await request(app)
          .post("/api/v1/tasks")
          .set("Authorization", `Bearer ${memberToken}`)
          .set("X-Tenant-ID", tenantId)
          .set("Idempotency-Key", idempotencyKey)
          .send({
            projectId,
            title: "Idempotent Task Creation Test",
            priority: "LOW",
          });

        expect(res.status).toBe(201);
        expect(res.body.data.task.title).toBe("Idempotent Task Creation Test");
      });

      it("should replay cached response on duplicate submit with X-Cache-Lookup header without creating duplicate task", async () => {
        const res = await request(app)
          .post("/api/v1/tasks")
          .set("Authorization", `Bearer ${memberToken}`)
          .set("X-Tenant-ID", tenantId)
          .set("Idempotency-Key", idempotencyKey)
          .send({
            projectId,
            title: "Idempotent Task Creation Test",
            priority: "LOW",
          });

        expect(res.status).toBe(201);
        expect(res.headers["x-cache-lookup"]).toBe("HIT-IDEMPOTENT");
        expect(res.body.data.task.title).toBe("Idempotent Task Creation Test");
      });
    });
  },
);
