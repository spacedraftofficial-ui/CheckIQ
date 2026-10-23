import { createApp } from "./app.js";
import { getConfig } from "./config.js";
import { closeDatabase, getDatabase } from "./db/client.js";
import { getLogger } from "./lib/logger.js";
import { ensureStorageDirectories } from "./lib/storage.js";
import { applyMigrations, defaultMigrationsFolder } from "./db/apply-migrations.js";
import { runSeed } from "./db/seed.js";

/**
 * Server bootstrap.
 */
async function main(): Promise<void> {
  const logger = getLogger();
  const config = getConfig();

  await ensureStorageDirectories();
  getDatabase();

  // Run migrations on startup
  try {
    const applied = await applyMigrations(config.DATABASE_URL, defaultMigrationsFolder());
    logger.info({ applied: applied.length }, "Migrations applied");
  } catch (err) {
    logger.error({ err }, "Migrations failed");
  }

  // Run seed on startup
  try {
    const { db } = getDatabase();
    await runSeed(db);
    logger.info("Seed completed");
  } catch (err) {
    logger.error({ err }, "Seed failed");
  }

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
