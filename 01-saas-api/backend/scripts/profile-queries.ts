/* eslint-disable no-console */
import { pool } from "../src/config/database";
import { logger } from "../src/config/logger";
import { uuidv7 } from "uuidv7";

interface QueryProfile {
  name: string;
  sql: string;
  params: unknown[];
}

async function runProfilingSweep(): Promise<void> {
  const client = await pool.connect();

  try {
    const tenantRes = await client.query("SELECT id FROM tenants LIMIT 1;");
    const tenantId = tenantRes.rows[0]?.id ?? uuidv7();

    console.log(`\n===============================================================`);
    console.log(`🚀 DATABASE PERFORMANCE & INDEX PROFILING SWEEP`);
    console.log(`🎯 Tenant Context: ${tenantId}`);
    console.log(`===============================================================\n`);

    const queriesToProfile: QueryProfile[] = [
      {
        name: "1. Keyset Cursor Pagination (Tasks: Page 1)",
        sql: `
          EXPLAIN (ANALYZE, BUFFERS, VERBOSE, COSTS, FORMAT TEXT)
          SELECT id, project_id, number, title, status, priority, created_at, version
          FROM tasks
          WHERE tenant_id = $1
          ORDER BY created_at DESC, id DESC
          LIMIT 21;
        `,
        params: [tenantId],
      },
      {
        name: "2. Keyset Cursor Pagination (Tasks: Page 2 with Keyset Tuple)",
        sql: `
          EXPLAIN (ANALYZE, BUFFERS, VERBOSE, COSTS, FORMAT TEXT)
          SELECT id, project_id, number, title, status, priority, created_at, version
          FROM tasks
          WHERE tenant_id = $1
            AND (created_at, id) < (CURRENT_TIMESTAMP, $2)
          ORDER BY created_at DESC, id DESC
          LIMIT 21;
        `,
        params: [tenantId, uuidv7()],
      },
      {
        name: "3. Fuzzy Trigram Search on Task Titles (pg_trgm GIN)",
        sql: `
          EXPLAIN (ANALYZE, BUFFERS, VERBOSE, COSTS, FORMAT TEXT)
          SELECT id, title, word_similarity('authentiction', title) AS sml
          FROM tasks
          WHERE tenant_id = $1
            AND title %> 'authentiction'
          ORDER BY sml DESC
          LIMIT 10;
        `,
        params: [tenantId],
      },
      {
        name: "4. Tamper-Evident Audit Log (Latest Hash Lookup)",
        sql: `
          EXPLAIN (ANALYZE, BUFFERS, VERBOSE, COSTS, FORMAT TEXT)
          SELECT current_hash, created_at
          FROM audit_logs
          WHERE tenant_id = $1
          ORDER BY created_at DESC
          LIMIT 1;
        `,
        params: [tenantId],
      },
    ];

    for (const q of queriesToProfile) {
      console.log(`---------------------------------------------------------------`);
      console.log(`🔍 Profiling Index Path for: ${q.name}`);
      console.log(`---------------------------------------------------------------`);

      await client.query("BEGIN;");
      await client.query("SELECT set_config('app.current_tenant', $1, true);", [tenantId]);

      // Force optimizer to evaluate the index path (simulates a table with millions of rows)
      await client.query("SET LOCAL enable_seqscan = off;");

      const result = await client.query<{ "QUERY PLAN": string }>(q.sql, q.params);
      const fullPlan = result.rows.map((row) => row["QUERY PLAN"]).join("\n");
      console.log(fullPlan);

      if (
        fullPlan.includes("Index Scan") ||
        fullPlan.includes("Bitmap Index Scan") ||
        fullPlan.includes("Index Only Scan")
      ) {
        console.log(`\n✅ High-scale index path verified!`);
      } else {
        console.log(`\nℹ️  Plan path: No direct index scan.`);
      }

      await client.query("ROLLBACK;");
      console.log("\n");
    }

    console.log(`===============================================================`);
    console.log(`🎉 Query profiling sweep completed successfully.`);
    console.log(`===============================================================\n`);
  } catch (error) {
    logger.error({ error }, "Error occurred during query profiling sweep");
  } finally {
    client.release();
    await pool.end();
  }
}

void runProfilingSweep();
