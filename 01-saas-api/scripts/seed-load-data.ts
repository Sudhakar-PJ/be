/* eslint-disable no-console */
import { pool } from "../src/config/database";
import { hashPassword } from "../src/lib/crypto";
import { uuidv7 } from "uuidv7";

export const BENCHMARK_TENANT_ID = "01a1ba34-e891-7718-8343-b184b2263be2";
export const BENCHMARK_USER_EMAIL = "loadtest@example.com";
export const BENCHMARK_PASSWORD = "Password123!";

async function seed(): Promise<void> {
  const client = await pool.connect();
  try {
    console.log("🌱 Seeding benchmark load test workspace...");

    // 1. Ensure Tenant exists
    await client.query(
      `
      INSERT INTO tenants (id, name, slug)
      VALUES ($1, 'Load Benchmark Corp', 'load-benchmark-corp')
      ON CONFLICT (id) DO NOTHING;
    `,
      [BENCHMARK_TENANT_ID],
    );

    // 2. Ensure User exists with hashed password
    const userCheck = await client.query("SELECT id FROM users WHERE email = $1", [
      BENCHMARK_USER_EMAIL,
    ]);
    let userId: string;

    if (userCheck.rows.length === 0) {
      userId = uuidv7();
      const passwordHash = await hashPassword(BENCHMARK_PASSWORD);
      await client.query(
        `
        INSERT INTO users (id, email, password_hash, full_name, is_verified)
        VALUES ($1, $2, $3, 'Load Tester', true)
      `,
        [userId, BENCHMARK_USER_EMAIL, passwordHash],
      );
      console.log(`✅ Created benchmark user: ${BENCHMARK_USER_EMAIL}`);
    } else {
      userId = (userCheck.rows[0] as { id: string }).id;
      console.log(`ℹ️ Benchmark user exists: ${userId}`);
    }

    // 3. Ensure Tenant Membership with OWNER role
    await client.query(
      `
      INSERT INTO tenant_members (tenant_id, user_id, role)
      VALUES ($1, $2, 'OWNER')
      ON CONFLICT (tenant_id, user_id) DO NOTHING;
    `,
      [BENCHMARK_TENANT_ID, userId],
    );

    // 4. Ensure Project exists
    const projCheck = await client.query("SELECT id FROM projects WHERE tenant_id = $1 LIMIT 1", [
      BENCHMARK_TENANT_ID,
    ]);
    let projectId: string;

    if (projCheck.rows.length === 0) {
      projectId = uuidv7();
      await client.query(
        `
        INSERT INTO projects (id, tenant_id, name, key, description)
        VALUES ($1, $2, 'Load Benchmark Project', 'LOAD', 'Project for high-concurrency benchmarks')
      `,
        [projectId, BENCHMARK_TENANT_ID],
      );
      console.log(`✅ Created benchmark project: ${projectId}`);
    } else {
      projectId = (projCheck.rows[0] as { id: string }).id;
      console.log(`ℹ️ Benchmark project exists: ${projectId}`);
    }

    console.log("🎉 Seeding complete! Load test credentials ready.");
  } catch (err) {
    console.error("❌ Seeding failed:", err);
  } finally {
    client.release();
    await pool.end();
  }
}

void seed();
