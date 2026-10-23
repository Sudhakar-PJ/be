import { Pool, PoolClient, QueryResult, QueryResultRow } from "pg";
import { env } from "./env";
import { logger } from "./logger";

const isNeon = env.DATABASE_URL.includes("neon.tech");
const requireSsl = env.NODE_ENV === "production" || isNeon;

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  min: env.DATABASE_POOL_MIN,
  max: env.DATABASE_POOL_MAX,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  ...(requireSsl && {
    ssl: {
      rejectUnauthorized: true,
    },
  }),
});

pool.on("error", (err: Error) => {
  logger.error({ err }, "Unexpected error on idle PostgreSQL client");
});
pool.on("connect", () => {
  logger.debug("New PostgreSQL client connection established in pool");
});

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<QueryResult<T>> {
  const queryStartTime = Date.now();
  try {
    const result = await pool.query<T>(text, params);
    const queryDurationMs = Date.now() - queryStartTime;

    logger.debug(
      {
        query: text,
        params,
        durationMs: queryDurationMs,
        rowCount: result.rowCount,
      },
      "SQL query executed",
    );
    return result;
  } catch (error) {
    const queryDurationMs = Date.now() - queryStartTime;
    logger.error(
      {
        query: text,
        params,
        durationMs: queryDurationMs,
        error,
      },
      "SQL query failed",
    );
    throw error;
  }
}

export async function withTransaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    const result = await pool.query("SELECT 1 AS healthy");
    return result.rowCount === 1;
  } catch (err) {
    logger.error({ err }, "Database health check failed");
    return false;
  }
}

export async function closeDatabasePool(): Promise<void> {
  logger.info("Closing PostgreSQL connection pool...");
  await pool.end();
  logger.info("PostgreSQL connection pool drained successfully");
}
