import express, { Request, Response } from "express";
import { correlationMiddleware } from "./middleware/correlation";
import { requestLogger } from "./middleware/request-logger";
import { logger } from "./config/logger";
import { errorHandler } from "./middleware/errorHandler";
import { NotFoundError } from "./lib/apiError";
import { asyncHandler } from "./lib/asyncHandler";
import { checkDatabaseHealth } from "./config/database";
import { checkRedisHealth } from "./config/redis";

const app = express();

app.use(correlationMiddleware);
app.use(requestLogger);
app.use(express.json());

app.get("/api/v1/health", (_req: Request, res: Response) => {
  logger.info("Health check endpoint was pinged");
  res.status(200).json({
    status: "healthy",
    timestamp: new Date().toISOString(),
  });
});

app.get(
  "/api/v1/ready",
  asyncHandler(async (_req: Request, res: Response) => {
    const [isDbHealthy, isRedisHealthy] = await Promise.all([
      checkDatabaseHealth(),
      checkRedisHealth(),
    ]);
    const isReady = isDbHealthy && isRedisHealthy;
    const responsePayload = {
      status: isReady ? "ready" : "unhealthy",
      checks: {
        database: isDbHealthy ? "connected" : "disconnected",
        redis: isRedisHealthy ? "connected" : "disconnected",
      },
      timestamp: new Date().toISOString(),
    };
    if (!isReady) {
      res.status(503).json(responsePayload);
      return;
    }
    res.status(200).json(responsePayload);
  }),
);

app.get(
  "/api/v1/test-error",
  asyncHandler(async () => {
    throw new NotFoundError("Resource not found");
  }),
);

app.use((req: Request, _res: Response) => {
  throw new NotFoundError(`Route ${req.method} ${req.originalUrl} not found`);
});

app.use(errorHandler);

export { app };
