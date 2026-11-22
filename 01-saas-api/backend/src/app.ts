import express, { Request, Response } from "express";
import { correlationMiddleware } from "./middleware/correlation";
import { requestLogger } from "./middleware/request-logger";
import { errorHandler } from "./middleware/errorHandler";
import { NotFoundError } from "./lib/apiError";
import { asyncHandler } from "./lib/asyncHandler";
import { healthRouter } from "./modules/health/health.routes";
import { healthController } from "./modules/health/health.controller";
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
import { metricsMiddleware } from "./middleware/metrics.middleware";
import { register } from "./metrics/registry";

const app = express();

app.use(correlationMiddleware);
app.use(metricsMiddleware);
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

// Prometheus scraping endpoint
app.get(
  "/metrics",
  asyncHandler(async (_req: Request, res: Response) => {
    res.setHeader("Content-Type", register.contentType);
    res.send(await register.metrics());
  }),
);

// Health & Readiness Probes (Root & Versioned paths for Kubernetes / Cloud Run)
app.use("/api/v1/health", healthRouter);
app.use("/health", healthRouter);
app.get("/api/v1/ready", asyncHandler(healthController.getReady));
app.get("/ready", asyncHandler(healthController.getReady));

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
