import { env } from "@config/env";
import { connectDB, disconnectDB } from "@config/db";
import { logger } from "@utils/logger";
import app from "./app";

const SHUTDOWN_TIMEOUT_MS = 10_000;

/**
 * Process entry point: connect the database, start listening, shut down cleanly.
 * The Express app itself is built in app.ts.
 */
const startServer = async (): Promise<void> => {
  await connectDB();

  const server = app.listen(env.PORT, () => {
    logger.info(`Server listening on port ${env.PORT} (${env.NODE_ENV})`);
    if (!env.isProduction) logger.info(`Swagger docs at http://localhost:${env.PORT}/api-docs`);
  });

  let shuttingDown = false;
  const shutdown = (signal: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`${signal} received, shutting down`);

    // If open connections or the disconnect hang, exit anyway
    setTimeout(() => {
      logger.error(`Shutdown took longer than ${SHUTDOWN_TIMEOUT_MS} ms, forcing exit`);
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS).unref();

    server.close(() => {
      disconnectDB()
        .then(() => process.exit(0))
        .catch((err: unknown) => {
          logger.error({ err }, "Shutdown failed");
          process.exit(1);
        });
    });
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
};

process.on("uncaughtException", (err: Error) => {
  logger.error({ err }, "Uncaught exception");
  process.exit(1);
});
process.on("unhandledRejection", (reason: unknown) => {
  logger.error({ reason }, "Unhandled rejection");
  process.exit(1);
});

startServer().catch((err: unknown) => {
  logger.error({ err }, "Server startup failed");
  process.exit(1);
});
