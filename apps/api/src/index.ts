import { createApp } from "./app.js";
import { getConfig } from "./config.js";
import { closeDatabase, getDatabase } from "./db/client.js";
import { getLogger } from "./lib/logger.js";
import { ensureStorageDirectories } from "./lib/storage.js";

/**
 * Server bootstrap.
 */
async function main(): Promise<void> {
  const logger = getLogger();
  const config = getConfig();

  await ensureStorageDirectories();
  getDatabase();

  const app = createApp();
  const server = app.listen(config.PORT, config.HOST, () => {
    logger.info(
      { port: config.PORT, host: config.HOST, env: config.NODE_ENV },
      "CheckIQ API listening",
    );
  });

  const shutdown = (signal: string) => {
    logger.info({ signal }, "Shutting down");
    server.close(() => {
      void closeDatabase().then(() => process.exit(0));
    });
    // Force exit if connections do not drain in time.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((error) => {
  const logger = getLogger();
  logger.error({ err: error }, "Failed to start CheckIQ API");
  process.exit(1);
});
