import express, { Request, Response } from "express";
import { correlationMiddleware } from "./middleware/correlation";
import { requestLogger } from "./middleware/request-logger";
import { logger } from "./config/logger";
import { errorHandler } from "./middleware/errorHandler";
import { NotFoundError } from "./lib/apiError";
import { asyncHandler } from "./lib/asyncHandler";
import { checkDatabaseHealth } from "./config/database";
import { checkRedisHealth } from "./config/redis";
import cookieParser from "cookie-parser";
import { authRouter } from "./modules/auth/auth.routes";
import { projectRouter } from "./modules/projects/project.routes";
import { taskRouter } from "./modules/tasks/task.routes";
import { patRouter } from "./modules/pats/pat.routes";
import { webhookRouter } from "./modules/webhooks/webhook.routes";
import helmet from "helmet";
import cors from "cors";
import { env } from "./config/env";
import compression from "compression";
import hpp from "hpp";

const app = express();

app.use(correlationMiddleware);
app.use(requestLogger);
app.use(helmet());
app.use(
  cors({
    origin: env.CORS_ORIGIN,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Tenant-ID",
      "Idempotency-Key",
      "X-Correlation-ID",
    ],
  }),
);
app.use(compression());
app.use(express.json({ limit: "1mb" }));
app.use(hpp());
app.use(cookieParser());

app.use("/api/v1/auth", authRouter);
app.use("/api/v1/projects", projectRouter);
app.use("/api/v1/tasks", taskRouter);
app.use("/api/v1/pats", patRouter);
app.use("/api/v1/webhooks", webhookRouter);

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
