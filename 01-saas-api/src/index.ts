import { app } from "./app";
import { env } from "./config/env";
import { logger } from "./config/logger";

const server = app.listen(env.PORT, () => {
  logger.info(
    { env: env.NODE_ENV, port: env.PORT },
    `🚀 Server listening on http://localhost:${env.PORT}`,
  );
});

// Basic graceful shutdown placeholder
process.on("SIGTERM", () => {
  logger.info("SIGTERM received, shutting down gracefully");
  server.close(() => {
    logger.info("Server closed successfully");
    process.exit(0);
  });
});
