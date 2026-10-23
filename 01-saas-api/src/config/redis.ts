import Redis, { RedisOptions } from "ioredis";
import { env } from "./env";
import { logger } from "./logger";

const redisOptions: RedisOptions = {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
  retryStrategy(times: number) {
    const delay = Math.min(times * 100, 3000);
    logger.warn({ attempt: times, delayMs: delay }, "Reconnecting to Redis...");
    return delay;
  },
};

export const redis = new Redis(env.REDIS_URL, redisOptions);

redis.on("connect", () => {
  logger.debug("Redis socket connection initiated");
});
redis.on("ready", () => {
  logger.info("Redis client connected and ready to accept commands");
});
redis.on("error", (err: Error) => {
  logger.error({ err: err.message }, "Redis client encountered an error");
});
redis.on("close", () => {
  logger.warn("Redis client connection closed");
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
