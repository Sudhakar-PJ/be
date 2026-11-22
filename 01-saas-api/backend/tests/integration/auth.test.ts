import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { app } from "../../src/app";
import { pool } from "../../src/config/database";
import { redis } from "../../src/config/redis";

describe("Milestone 1: Integration & Adversarial Auth Suite", () => {
  const testUser = {
    email: `vitest_${Date.now()}@example.com`,
    password: "StrongPassword123!",
    fullName: "Vitest Engineer",
  };

  let token1: string;
  let token2: string;

  // Ensure database pool and redis connection close cleanly after tests finish
  afterAll(async () => {
    await pool.end();
    await redis.quit();
  });

  // ===========================================================================
  // 1. Operational Health Checks
  // ===========================================================================
  describe("Health & Readiness Endpoints", () => {
    it("GET /api/v1/health should return 200 healthy", async () => {
      const res = await request(app).get("/api/v1/health");
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        status: "healthy",
        timestamp: expect.any(String),
      });
    });

    it("GET /api/v1/ready should return 200 with database and redis connected", async () => {
      const res = await request(app).get("/api/v1/ready");
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("ready");
      expect(res.body.checks.database).toBe("connected");
      expect(res.body.checks.redis).toBe("connected");
    });
  });

  // ===========================================================================
  // 2. Registration (POST /signup)
  // ===========================================================================
  describe("POST /api/v1/auth/signup", () => {
    it("should successfully register a new user with Argon2id and RS256 token", async () => {
      const res = await request(app)
        .post("/api/v1/auth/signup")
        .send(testUser);

      expect(res.status).toBe(201);
      expect(res.body.status).toBe("success");
      expect(res.body.data.user.email).toBe(testUser.email.toLowerCase());
      expect(res.body.data.user.fullName).toBe(testUser.fullName);
      expect(res.body.data.user.isVerified).toBe(false);
      // Security Check: password_hash must NEVER be exposed
      expect(res.body.data.user).not.toHaveProperty("password_hash");
      expect(res.body.data.accessToken).toBeDefined();

      // Verify HttpOnly cookie header
      const cookie = (res.headers["set-cookie"] ?? [])[0] ?? "";
      expect(cookie).toMatch(/refreshToken=/);
      expect(cookie).toMatch(/HttpOnly/);
      expect(cookie).toMatch(/SameSite=Strict/);
    });

    it("should reject duplicate email registration with RFC 9457 409 Conflict", async () => {
      const res = await request(app)
        .post("/api/v1/auth/signup")
        .send(testUser);

      expect(res.status).toBe(409);
      expect(res.headers["content-type"]).toMatch(/application\/problem\+json/);
      expect(res.body.code).toBe("EMAIL_ALREADY_EXISTS");
      expect(res.body.correlationId).toBeDefined();
    });

    it("should reject invalid email and short password with RFC 9457 422 Unprocessable Entity", async () => {
      const res = await request(app)
        .post("/api/v1/auth/signup")
        .send({
          email: "invalid-email",
          password: "short",
          fullName: "",
        });

      expect(res.status).toBe(422);
      expect(res.headers["content-type"]).toMatch(/application\/problem\+json/);
      expect(res.body.code).toBe("VALIDATION_ERROR");
      expect(res.body.errors).toBeInstanceOf(Array);
      expect(res.body.errors.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ===========================================================================
  // 3. Authentication (POST /login)
  // ===========================================================================
  describe("POST /api/v1/auth/login", () => {
    it("should authenticate valid credentials and issue a new session family", async () => {
      const res = await request(app)
        .post("/api/v1/auth/login")
        .send({
          email: testUser.email,
          password: testUser.password,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.refreshToken).toBeDefined();

      // Store Token 1 for rotation and replay attack tests
      token1 = res.body.data.refreshToken;
    });

    it("should reject wrong password with 401 Unauthorized", async () => {
      const res = await request(app)
        .post("/api/v1/auth/login")
        .send({
          email: testUser.email,
          password: "completely-wrong-password",
        });

      expect(res.status).toBe(401);
      expect(res.body.code).toBe("INVALID_CREDENTIALS");
    });

    it("should reject non-existent user with 401 Unauthorized", async () => {
      const res = await request(app)
        .post("/api/v1/auth/login")
        .send({
          email: "nonexistent@example.com",
          password: "any-password",
        });

      expect(res.status).toBe(401);
      expect(res.body.code).toBe("INVALID_CREDENTIALS");
    });
  });

  // ===========================================================================
  // 4. Token Rotation (POST /refresh)
  // ===========================================================================
  describe("POST /api/v1/auth/refresh (Session Rotation)", () => {
    it("should rotate refresh token and issue new access token", async () => {
      const res = await request(app)
        .post("/api/v1/auth/refresh")
        .send({ refreshToken: token1 });

      expect(res.status).toBe(200);
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.refreshToken).toBeDefined();
      expect(res.body.data.refreshToken).not.toBe(token1);

      // Store Token 2
      token2 = res.body.data.refreshToken;
    });
  });

  // ===========================================================================
  // 5. Adversarial Threat Scenario: Refresh Token Replay Attack
  // ===========================================================================
  describe("Adversarial Threat: Token Replay & Family Revocation", () => {
    it("should detect replay attack when consumed Token 1 is submitted again", async () => {
      // Attacker submits Token 1 which was ALREADY rotated in the previous test
      const res = await request(app)
        .post("/api/v1/auth/refresh")
        .send({ refreshToken: token1 });

      expect(res.status).toBe(401);
      expect(res.body.code).toBe("TOKEN_REUSE_DETECTED");
      expect(res.body.detail).toMatch(/reuse detected/i);
    });

    it("should prove Token 2 was also nuked due to family revocation", async () => {
      // Because reuse was detected on Token 1, the entire family was revoked.
      // Even though Token 2 is the legitimate child token, it must now be dead!
      const res = await request(app)
        .post("/api/v1/auth/refresh")
        .send({ refreshToken: token2 });

      expect(res.status).toBe(401);
      expect(res.body.code).toBe("TOKEN_REUSE_DETECTED");
    });
  });

  // ===========================================================================
  // 6. Logout (POST /logout)
  // ===========================================================================
  describe("POST /api/v1/auth/logout", () => {
    it("should revoke the session and clear the refreshToken cookie", async () => {
      // Log in fresh to get an active token
      const loginRes = await request(app)
        .post("/api/v1/auth/login")
        .send({
          email: testUser.email,
          password: testUser.password,
        });

      const activeToken = loginRes.body.data.refreshToken;

      // Logout with that token
      const logoutRes = await request(app)
        .post("/api/v1/auth/logout")
        .set("Cookie", [`refreshToken=${activeToken}`])
        .send();

      expect(logoutRes.status).toBe(200);
      expect(logoutRes.body.message).toMatch(/logged out successfully/i);

      // Verify the cookie was cleared (Expires in the past)
      const cookie = (logoutRes.headers["set-cookie"] ?? [])[0] ?? "";
      expect(cookie).toMatch(/refreshToken=;/);
    });
  });
});
