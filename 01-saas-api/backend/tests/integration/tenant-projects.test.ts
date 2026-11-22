import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { uuidv7 } from "uuidv7";
import { app } from "../../src/app";
import { pool } from "../../src/config/database";
import { redis } from "../../src/config/redis";

describe(
  "Milestone 2: Multi-Tenancy & Row-Level Security Adversarial Suite",
  { timeout: 30000 },
  () => {
    // Test Tenants
    const tenantAlphaId = uuidv7();
    const tenantBetaId = uuidv7();

    // Test Users
    let userAlphaToken: string;
    let userBetaToken: string;
    let userViewerToken: string;
    let userMemberToken: string;

    let projectAlphaId: string;

    beforeAll(async () => {
      // 1. Create Tenant Alpha and Tenant Beta in Postgres
      await pool.query(
        `INSERT INTO tenants (id, name, slug) VALUES 
       ($1, 'Alpha Corp', 'alpha-corp'),
       ($2, 'Beta Ltd', 'beta-ltd')`,
        [tenantAlphaId, tenantBetaId],
      );

      // 2. Register User Alpha (Owner of Alpha)
      const signupAlpha = await request(app)
        .post("/api/v1/auth/signup")
        .send({
          email: `alpha_${Date.now()}@example.com`,
          password: "StrongPassword123!",
          fullName: "Alpha Owner",
        });
      userAlphaToken = signupAlpha.body.data.accessToken;
      const userAlphaId = signupAlpha.body.data.user.id;

      // 3. Register User Beta (Owner of Beta)
      const signupBeta = await request(app)
        .post("/api/v1/auth/signup")
        .send({
          email: `beta_${Date.now()}@example.com`,
          password: "StrongPassword123!",
          fullName: "Beta Owner",
        });
      userBetaToken = signupBeta.body.data.accessToken;
      const userBetaId = signupBeta.body.data.user.id;

      // 4. Register User Viewer (Viewer in Alpha)
      const signupViewer = await request(app)
        .post("/api/v1/auth/signup")
        .send({
          email: `viewer_${Date.now()}@example.com`,
          password: "StrongPassword123!",
          fullName: "Alpha Viewer",
        });
      userViewerToken = signupViewer.body.data.accessToken;
      const userViewerId = signupViewer.body.data.user.id;

      // 5. Register User Member (Member in Alpha)
      const signupMember = await request(app)
        .post("/api/v1/auth/signup")
        .send({
          email: `member_${Date.now()}@example.com`,
          password: "StrongPassword123!",
          fullName: "Alpha Member",
        });
      userMemberToken = signupMember.body.data.accessToken;
      const userMemberId = signupMember.body.data.user.id;

      // 6. Assign Tenant Memberships
      await pool.query(
        `INSERT INTO tenant_members (tenant_id, user_id, role) VALUES 
       ($1, $2, 'OWNER'),
       ($3, $4, 'OWNER'),
       ($1, $5, 'VIEWER'),
       ($1, $6, 'MEMBER')`,
        [tenantAlphaId, userAlphaId, tenantBetaId, userBetaId, userViewerId, userMemberId],
      );
    }, 30000);

    afterAll(async () => {
      // Clean up test data
      await pool.query(`DELETE FROM tenants WHERE id IN ($1, $2)`, [tenantAlphaId, tenantBetaId]);
      await pool.end();
      await redis.quit();
    });

    // ===========================================================================
    // 1. Guard Rails: Missing / Invalid Headers
    // ===========================================================================
    describe("Authentication & Tenancy Guard Rails", () => {
      it("should reject requests without Authorization Bearer header with 401", async () => {
        const res = await request(app).get("/api/v1/projects").set("X-Tenant-ID", tenantAlphaId);

        expect(res.status).toBe(401);
        expect(res.body.code).toBe("MISSING_TOKEN");
      });

      it("should reject requests without X-Tenant-ID header with 400", async () => {
        const res = await request(app)
          .get("/api/v1/projects")
          .set("Authorization", `Bearer ${userAlphaToken}`);

        expect(res.status).toBe(400);
        expect(res.body.code).toBe("MISSING_TENANT_HEADER");
      });

      it("should reject requests with invalid UUID in X-Tenant-ID with 400", async () => {
        const res = await request(app)
          .get("/api/v1/projects")
          .set("Authorization", `Bearer ${userAlphaToken}`)
          .set("X-Tenant-ID", "not-a-valid-uuid");

        expect(res.status).toBe(400);
        expect(res.body.code).toBe("INVALID_TENANT_ID");
      });

      it("should reject a user trying to access a tenant they do NOT belong to with 403", async () => {
        // User Alpha tries to masquerade into Tenant Beta
        const res = await request(app)
          .get("/api/v1/projects")
          .set("Authorization", `Bearer ${userAlphaToken}`)
          .set("X-Tenant-ID", tenantBetaId);

        expect(res.status).toBe(403);
        expect(res.body.code).toBe("TENANT_ACCESS_DENIED");
      });
    });

    // ===========================================================================
    // 2. Project Creation & Tenant-Scoped Key Uniqueness
    // ===========================================================================
    describe("POST /api/v1/projects", () => {
      it("should allow Tenant Alpha OWNER to create Project A with key 'CORE'", async () => {
        const res = await request(app)
          .post("/api/v1/projects")
          .set("Authorization", `Bearer ${userAlphaToken}`)
          .set("X-Tenant-ID", tenantAlphaId)
          .send({
            name: "Alpha Core Engine",
            key: "CORE",
            description: "Internal core engine for Alpha",
          });

        expect(res.status).toBe(201);
        expect(res.body.status).toBe("success");
        expect(res.body.data.project.name).toBe("Alpha Core Engine");
        expect(res.body.data.project.key).toBe("CORE");
        expect(res.body.data.project.tenantId).toBe(tenantAlphaId);

        projectAlphaId = res.body.data.project.id;
      });

      it("should reject duplicate project key 'CORE' within Tenant Alpha with 409 Conflict", async () => {
        const res = await request(app)
          .post("/api/v1/projects")
          .set("Authorization", `Bearer ${userAlphaToken}`)
          .set("X-Tenant-ID", tenantAlphaId)
          .send({
            name: "Another Alpha Project",
            key: "CORE",
          });

        expect(res.status).toBe(409);
        expect(res.body.code).toBe("PROJECT_KEY_ALREADY_EXISTS");
      });

      it("should allow Tenant Beta to create project with same key 'CORE' (Workspace-Scoped)", async () => {
        const res = await request(app)
          .post("/api/v1/projects")
          .set("Authorization", `Bearer ${userBetaToken}`)
          .set("X-Tenant-ID", tenantBetaId)
          .send({
            name: "Beta Core Engine",
            key: "CORE",
          });

        expect(res.status).toBe(201);
        expect(res.body.data.project.tenantId).toBe(tenantBetaId);
      });
    });

    // ===========================================================================
    // 3. PostgreSQL Row-Level Security: Cross-Tenant Isolation
    // ===========================================================================
    describe("PostgreSQL RLS Multi-Tenant Isolation Enforcement", () => {
      it("Tenant Beta listing projects should NEVER see Tenant Alpha's project", async () => {
        const res = await request(app)
          .get("/api/v1/projects")
          .set("Authorization", `Bearer ${userBetaToken}`)
          .set("X-Tenant-ID", tenantBetaId);

        expect(res.status).toBe(200);
        const projects = res.body.data.projects;
        const alphaProjectFound = projects.some((p: { id: string }) => p.id === projectAlphaId);
        expect(alphaProjectFound).toBe(false);
      });

      it("Tenant Beta attempting to GET Tenant Alpha project by direct ID should return 404", async () => {
        const res = await request(app)
          .get(`/api/v1/projects/${projectAlphaId}`)
          .set("Authorization", `Bearer ${userBetaToken}`)
          .set("X-Tenant-ID", tenantBetaId);

        expect(res.status).toBe(404);
        expect(res.body.code).toBe("PROJECT_NOT_FOUND");
      });

      it("Tenant Beta attempting to PATCH Tenant Alpha project by direct ID should return 404", async () => {
        const res = await request(app)
          .patch(`/api/v1/projects/${projectAlphaId}`)
          .set("Authorization", `Bearer ${userBetaToken}`)
          .set("X-Tenant-ID", tenantBetaId)
          .send({ name: "Hacked by Beta" });

        expect(res.status).toBe(404);
        expect(res.body.code).toBe("PROJECT_NOT_FOUND");
      });

      it("Tenant Beta attempting to DELETE Tenant Alpha project by direct ID should return 404", async () => {
        const res = await request(app)
          .delete(`/api/v1/projects/${projectAlphaId}`)
          .set("Authorization", `Bearer ${userBetaToken}`)
          .set("X-Tenant-ID", tenantBetaId);

        expect(res.status).toBe(404);
        expect(res.body.code).toBe("PROJECT_NOT_FOUND");
      });
    });

    // ===========================================================================
    // 4. RBAC Hierarchy Enforcement (VIEWER < MEMBER < ADMIN < OWNER)
    // ===========================================================================
    describe("RBAC Permissions Hierarchy", () => {
      it("VIEWER can list projects", async () => {
        const res = await request(app)
          .get("/api/v1/projects")
          .set("Authorization", `Bearer ${userViewerToken}`)
          .set("X-Tenant-ID", tenantAlphaId);

        expect(res.status).toBe(200);
      });

      it("VIEWER cannot create a project (requires MEMBER) -> 403 Forbidden", async () => {
        const res = await request(app)
          .post("/api/v1/projects")
          .set("Authorization", `Bearer ${userViewerToken}`)
          .set("X-Tenant-ID", tenantAlphaId)
          .send({
            name: "Viewer Illegal Project",
            key: "VIEW1",
          });

        expect(res.status).toBe(403);
        expect(res.body.code).toBe("INSUFFICIENT_PERMISSIONS");
      });

      it("MEMBER can create a project -> 201 Created", async () => {
        const res = await request(app)
          .post("/api/v1/projects")
          .set("Authorization", `Bearer ${userMemberToken}`)
          .set("X-Tenant-ID", tenantAlphaId)
          .send({
            name: "Member Project",
            key: "MEMB1",
          });

        expect(res.status).toBe(201);
      });

      it("MEMBER cannot delete a project (requires ADMIN) -> 403 Forbidden", async () => {
        const res = await request(app)
          .delete(`/api/v1/projects/${projectAlphaId}`)
          .set("Authorization", `Bearer ${userMemberToken}`)
          .set("X-Tenant-ID", tenantAlphaId);

        expect(res.status).toBe(403);
        expect(res.body.code).toBe("INSUFFICIENT_PERMISSIONS");
      });

      it("OWNER / ADMIN can delete a project -> 204 No Content", async () => {
        const res = await request(app)
          .delete(`/api/v1/projects/${projectAlphaId}`)
          .set("Authorization", `Bearer ${userAlphaToken}`)
          .set("X-Tenant-ID", tenantAlphaId);

        expect(res.status).toBe(204);

        // Verify it is gone
        const verifyRes = await request(app)
          .get(`/api/v1/projects/${projectAlphaId}`)
          .set("Authorization", `Bearer ${userAlphaToken}`)
          .set("X-Tenant-ID", tenantAlphaId);

        expect(verifyRes.status).toBe(404);
      });
    });
  },
);
