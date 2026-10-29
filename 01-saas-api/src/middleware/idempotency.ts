import { type Request, type Response, type NextFunction } from "express";
import { redis } from "../config/redis";
import { ConflictError, BadRequestError } from "../lib/apiError";

const IDEMPOTENCY_HEADER = "idempotency-key";
const IN_FLIGHT_TTL_SECONDS = 120; // 2 minutes lock
const CACHE_TTL_SECONDS = 86400; // 24 hours response cache

interface IdempotencyRecord {
  status: "PROCESSING" | "COMPLETED";
  statusCode?: number;
  body?: unknown;
}

/**
 * Ensures mutations (POST, PUT, PATCH) are executed exactly once per Idempotency-Key.
 * Replays cached response on duplicate submissions without touching controllers or DB.
 */
export function idempotency(options: { required?: boolean } = { required: false }) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // 1. Extract Idempotency-Key header
      const rawKey = req.headers[IDEMPOTENCY_HEADER];
      const idempotencyKey = Array.isArray(rawKey) ? rawKey[0] : rawKey;

      if (!idempotencyKey) {
        if (options.required) {
          throw new BadRequestError(
            `Missing required '${IDEMPOTENCY_HEADER}' header for this operation`,
            "MISSING_IDEMPOTENCY_KEY",
          );
        }
        return next();
      }

      // Must be authenticated and within a tenant context
      const tenantId = req.tenant?.id;
      if (!tenantId) {
        return next();
      }

      const redisKey = `idempotency:${tenantId}:${idempotencyKey}`;

      // 2. Attempt atomic lock acquisition with SET NX (Not Exists)
      const acquired = await redis.set(
        redisKey,
        JSON.stringify({ status: "PROCESSING" }),
        "EX",
        IN_FLIGHT_TTL_SECONDS,
        "NX",
      );

      if (!acquired) {
        // Key already exists! Check its current state
        const existingRaw = await redis.get(redisKey);
        if (!existingRaw) {
          return next();
        }

        const existingRecord: IdempotencyRecord = JSON.parse(existingRaw);

        if (existingRecord.status === "PROCESSING") {
          throw new ConflictError(
            "An identical request with this Idempotency-Key is currently in progress",
            "IDEMPOTENCY_IN_FLIGHT",
          );
        }

        if (existingRecord.status === "COMPLETED" && existingRecord.statusCode) {
          // Replay cached response directly from Redis (bypass service, repo, DB)
          res.setHeader("X-Cache-Lookup", "HIT-IDEMPOTENT");
          res.status(existingRecord.statusCode).json(existingRecord.body);
          return;
        }
      }

      // 3. Intercept res.send / res.json to capture response payload
      const originalSend = res.send.bind(res);

      res.send = (body: unknown): Response => {
        // Only cache successful or intentional client responses (2xx, 4xx)
        // Do not cache transient 500 server crashes so clients can retry!
        if (res.statusCode < 500) {
          let parsedBody = body;
          if (typeof body === "string") {
            try {
              parsedBody = JSON.parse(body);
            } catch {
              parsedBody = body;
            }
          }

          const cacheRecord: IdempotencyRecord = {
            status: "COMPLETED",
            statusCode: res.statusCode,
            body: parsedBody,
          };

          // Cache completed response in Redis for 24 hours (fire-and-forget)
          redis.set(redisKey, JSON.stringify(cacheRecord), "EX", CACHE_TTL_SECONDS).catch(() => {});
        } else {
          // If 5xx internal error occurred, delete the lock so client can immediately retry
          redis.del(redisKey).catch(() => {});
        }

        return originalSend(body);
      };

      next();
    } catch (error) {
      next(error);
    }
  };
}
