import { pool } from "../../config/database";
import { redis } from "../../config/redis";
import { logger } from "../../config/logger";

export interface LivenessResult {
  status: "alive" | "degraded";
  uptimeSeconds: number;
  eventLoopLagMs: number;
  memory: {
    heapUsedMB: number;
    heapTotalMB: number;
    rssMB: number;
  };
  timestamp: string;
}

export interface SubsystemCheck {
  status: "up" | "down";
  latencyMs: number;
  error?: string;
}

export interface ReadinessResult {
  status: "ready" | "unhealthy";
  checks: {
    database: "connected" | "disconnected";
    redis: "connected" | "disconnected";
  };
  details: {
    database: SubsystemCheck;
    redis: SubsystemCheck;
  };
  timestamp: string;
}

/**
 * Executes an async task with a strict timeout guard.
 * Prevents hanging sockets from blocking Kubernetes probe responses.
 */
async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operationName: string,
): Promise<T> {
  let timeoutId: NodeJS.Timeout;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${operationName} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    timeoutId.unref();
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId!);
  }
}

/**
 * Measures the single-threaded event loop responsiveness of the Node.js process.
 */
function measureEventLoopLag(): Promise<number> {
  const start = process.hrtime.bigint();
  return new Promise((resolve) => {
    setImmediate(() => {
      const lagNs = process.hrtime.bigint() - start;
      const lagMs = Number(lagNs) / 1e6;
      resolve(Math.round(lagMs * 100) / 100);
    });
  });
}

export class HealthService {
  /**
   * Liveness Probe: Verifies the process is alive, unblocked, and has healthy memory.
   * MUST NEVER check external databases or network services.
   */
  async checkLiveness(): Promise<LivenessResult> {
    const lagMs = await measureEventLoopLag();
    const mem = process.memoryUsage();

    // If event loop lag is > 1000ms, the main thread is severely saturated
    const isDegraded = lagMs > 1000;

    return {
      status: isDegraded ? "degraded" : "alive",
      uptimeSeconds: Math.floor(process.uptime()),
      eventLoopLagMs: lagMs,
      memory: {
        heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
        heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
        rssMB: Math.round(mem.rss / 1024 / 1024),
      },
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Readiness Probe: Verifies all essential downstream dependencies (PostgreSQL, Redis)
   * can accept work within strict latency timeouts.
   */
  async checkReadiness(): Promise<ReadinessResult> {
    const [dbCheck, redisCheck] = await Promise.all([this.pingDatabase(), this.pingRedis()]);

    const isReady = dbCheck.status === "up" && redisCheck.status === "up";

    return {
      status: isReady ? "ready" : "unhealthy",
      checks: {
        database: dbCheck.status === "up" ? "connected" : "disconnected",
        redis: redisCheck.status === "up" ? "connected" : "disconnected",
      },
      details: {
        database: dbCheck,
        redis: redisCheck,
      },
      timestamp: new Date().toISOString(),
    };
  }

  private async pingDatabase(): Promise<SubsystemCheck> {
    const start = process.hrtime.bigint();
    try {
      await withTimeout(pool.query("SELECT 1;"), 2000, "PostgreSQL query");
      const latencyMs = Number(process.hrtime.bigint() - start) / 1e6;
      return { status: "up", latencyMs: Math.round(latencyMs * 100) / 100 };
    } catch (err) {
      const latencyMs = Number(process.hrtime.bigint() - start) / 1e6;
      logger.error({ err }, "Readiness check: PostgreSQL ping failed");
      return {
        status: "down",
        latencyMs: Math.round(latencyMs * 100) / 100,
        error: (err as Error).message,
      };
    }
  }

  private async pingRedis(): Promise<SubsystemCheck> {
    const start = process.hrtime.bigint();
    try {
      const pong = await withTimeout(redis.ping(), 1000, "Redis ping");
      const latencyMs = Number(process.hrtime.bigint() - start) / 1e6;
      if (pong !== "PONG") {
        return {
          status: "down",
          latencyMs: Math.round(latencyMs * 100) / 100,
          error: `Unexpected Redis ping response: ${pong}`,
        };
      }
      return { status: "up", latencyMs: Math.round(latencyMs * 100) / 100 };
    } catch (err) {
      const latencyMs = Number(process.hrtime.bigint() - start) / 1e6;
      logger.error({ err }, "Readiness check: Redis ping failed");
      return {
        status: "down",
        latencyMs: Math.round(latencyMs * 100) / 100,
        error: (err as Error).message,
      };
    }
  }
}

export const healthService = new HealthService();
