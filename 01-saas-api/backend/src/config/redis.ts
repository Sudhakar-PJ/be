import Redis, { RedisOptions } from "ioredis";
import { env } from "./env";
import { logger } from "./logger";
import { redisConnectedStatus } from "../metrics/redis.metrics";

export const redisConnectionOptions: RedisOptions = {
  maxRetriesPerRequest: null,
  enableReadyCheck: false, // Recommended false for BullMQ to avoid connection race conditions
  retryStrategy(times: number) {
    const delay = Math.min(times * 100, 3000);
    logger.warn({ attempt: times, delayMs: delay }, "Reconnecting to Redis...");
    return delay;
  },
};

// Application-level Redis client (used for caching, rate limits, idempotency keys)
export const redis = new Redis(env.REDIS_URL, {
  ...redisConnectionOptions,
  enableReadyCheck: true,
});

redis.on("connect", () => {
  logger.debug("Redis socket connection initiated");
});
redis.on("ready", () => {
  logger.info("Redis client connected and ready to accept commands");
  redisConnectedStatus.set(1);
});
redis.on("error", (err: Error) => {
  logger.error({ err: err.message }, "Redis client encountered an error");
  redisConnectedStatus.set(0);
});
redis.on("close", () => {
  logger.warn("Redis client connection closed");
  redisConnectedStatus.set(0);
});

export async function checkRedisHealth(): Promise<boolean> {
  try {
    const response = await redis.ping();
    return response === "PONG";
  } catch (err) {
    logger.error({ err }, "Redis health check ping failed");
    return false;
  }
}

export async function closeRedisConnection(): Promise<void> {
  logger.info("Closing Redis connection...");
  await redis.quit();
  logger.info("Redis connection closed cleanly");
}
