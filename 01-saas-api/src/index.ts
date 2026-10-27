import { app } from "./app";
import { closeDatabasePool } from "./config/database";
import { env } from "./config/env";
import { logger } from "./config/logger";
import { closeRedisConnection } from "./config/redis";

const server = app.listen(env.PORT, () => {
  logger.info(
    { env: env.NODE_ENV, port: env.PORT },
    `🚀 Server listening on http://localhost:${env.PORT}`,
  );
});

let isShuttingDown = false;

async function handleGracefulShutdown(signal: string): Promise<void> {
  if (isShuttingDown) {
    logger.warn({ signal }, "Shutdown already in progress, ignoring duplicate signal.");
    return;
  }

  isShuttingDown = true;
  logger.info({ signal }, `Received ${signal}. Initiating graceful shutdown...`);

  // 1. Force exit if cleanup takes longer than 10 seconds (fail-safe watchdog)
  const forceExitTimeout = setTimeout(() => {
    logger.error("Graceful shutdown timed out after 10s. Forcing exit.");
    process.exit(1);
  }, 10000);
  forceExitTimeout.unref();

  try {
    // 2. Stop accepting new HTTP requests & allow in-flight requests to complete
    await new Promise<void>((resolve, reject) => {
      server.close((err) => {
        if (err) {
          logger.error({ err }, "Error while closing HTTP server.");
          reject(err);
        } else {
          logger.info("HTTP server closed. No longer accepting new connections.");
          resolve();
        }
      });
    });

    // 3. Drain PostgreSQL connection pool
    await closeDatabasePool();

    // 4. Close Redis client connection cleanly
    await closeRedisConnection();

    logger.info("All resources closed cleanly. Exiting process.");
    process.exit(0);
  } catch (error) {
    logger.error({ error }, "Error encountered during graceful shutdown. Forcing exit.");
    process.exit(1);
  }
}

// Intercept Kubernetes / Docker stop signals and terminal interrupts
process.on("SIGTERM", () => void handleGracefulShutdown("SIGTERM"));
process.on("SIGINT", () => void handleGracefulShutdown("SIGINT"));

// Catch unhandled rejections and uncaught exceptions to prevent silent crashes
process.on("unhandledRejection", (reason) => {
  logger.fatal({ err: reason }, "Unhandled Promise Rejection detected.");
});

process.on("uncaughtException", (error) => {
  logger.fatal({ err: error }, "Uncaught Exception detected. Initiating emergency shutdown.");
  void handleGracefulShutdown("uncaughtException");
});
