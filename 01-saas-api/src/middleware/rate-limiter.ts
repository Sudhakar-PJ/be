import { Request, Response, NextFunction } from "express";
import { redis } from "../config/redis";
import { TooManyRequestsError } from "../lib/apiError";

/**
 * Atomic Lua script implementing a Sliding Window rate limiter via Redis Sorted Sets (ZSET).
 *
 * KEYS[1]: Rate limit Redis key (e.g., 'rl:auth:ip:127.0.0.1')
 * ARGV[1]: Current Unix timestamp in milliseconds (now)
 * ARGV[2]: Window duration in milliseconds (windowMs)
 * ARGV[3]: Maximum requests permitted within the window (limit)
 *
 * Returns: [allowed (0 or 1), remaining, resetTimestampSeconds, retryAfterSeconds]
 */
const SLIDING_WINDOW_LUA = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local clearBefore = now - window

-- 1. Evict timestamps that fell outside the sliding window
redis.call('ZREMRANGEBYSCORE', key, '-inf', clearBefore)

-- 2. Count active requests within the window
local currentRequests = redis.call('ZCARD', key)

if currentRequests < limit then
  -- Allowed: Add current request timestamp with a unique sequence number
  local seq = redis.call('INCR', key .. ':seq')
  redis.call('ZADD', key, now, now .. ':' .. seq)

  -- Set TTL to clean up idle keys (window * 2 to keep memory tidy)
  local ttlSeconds = math.ceil((window * 2) / 1000)
  redis.call('EXPIRE', key, ttlSeconds)
  redis.call('EXPIRE', key .. ':seq', ttlSeconds)

  local remaining = limit - currentRequests - 1
  local resetAt = math.ceil((now + window) / 1000)
  return { 1, remaining, resetAt, 0 }
else
  -- Blocked: Determine when the oldest request in the window expires
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  local resetTime = now + window
  if oldest and oldest[2] then
    resetTime = tonumber(oldest[2]) + window
  end

  local retryAfter = math.max(1, math.ceil((resetTime - now) / 1000))
  local resetAt = math.ceil(resetTime / 1000)
  return { 0, 0, resetAt, retryAfter }
end
`;

export interface RateLimiterOptions {
  windowMs: number;
  limit: number;
  keyPrefix?: string;
  keyGenerator?: (req: Request) => string;
  skip?: (req: Request) => boolean;
}

/**
 * Derives a rate limit key from the incoming request.
 * - Authenticated users are keyed by user ID: 'user:<userId>'
 * - PAT requests are keyed by PAT ID: 'pat:<patId>'
 * - Public/anonymous requests are keyed by IP address: 'ip:<clientIp>'
 */
export function defaultKeyGenerator(req: Request): string {
  if (req.user?.id) {
    return `user:${req.user.id}`;
  }
  if (req.auth?.type === "PAT" && req.auth.patId) {
    return `pat:${req.auth.patId}`;
  }
  const clientIp =
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
    req.ip ||
    req.socket.remoteAddress ||
    "unknown";
  return `ip:${clientIp}`;
}

/**
 * Creates an Express middleware that enforces sliding-window rate limits via Redis Lua.
 */
export function rateLimiter(options: RateLimiterOptions) {
  const {
    windowMs,
    limit,
    keyPrefix = "rl:gen",
    keyGenerator = defaultKeyGenerator,
    skip,
  } = options;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (skip && skip(req)) {
      return next();
    }

    try {
      const identifier = keyGenerator(req);
      const redisKey = `${keyPrefix}:${identifier}`;
      const now = Date.now();

      // Execute atomic Lua script in Redis
      const result = (await redis.eval(
        SLIDING_WINDOW_LUA,
        1,
        redisKey,
        now.toString(),
        windowMs.toString(),
        limit.toString(),
      )) as [number, number, number, number];

      const [allowed, remaining, resetAt, retryAfter] = result;

      // Attach standard IETF RateLimit headers
      res.setHeader("RateLimit-Limit", limit.toString());
      res.setHeader("RateLimit-Remaining", Math.max(0, remaining).toString());
      res.setHeader("RateLimit-Reset", resetAt.toString());

      if (allowed === 1) {
        return next();
      }

      // Rate limit exceeded: attach Retry-After header and reject with 429
      res.setHeader("Retry-After", retryAfter.toString());
      throw new TooManyRequestsError(
        `Too many requests. You have exceeded your rate limit of ${limit} requests per ${Math.round(windowMs / 1000)} seconds. Please retry after ${retryAfter} seconds.`,
      );
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Sensitive Auth Rate Limiter: 20 requests per minute per IP.
 * Protects login, signup, and refresh routes against credential stuffing.
 */
export const authRateLimiter = rateLimiter({
  windowMs: 60 * 1000, // 1 minute
  limit: 20,
  keyPrefix: "rl:auth",
});

/**
 * General API Rate Limiter: 100 requests per minute per user/IP.
 */
export const apiRateLimiter = rateLimiter({
  windowMs: 60 * 1000, // 1 minute
  limit: 100,
  keyPrefix: "rl:api",
});
