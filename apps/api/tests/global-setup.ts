import "./env.js";
import { applyMigrations, defaultMigrationsFolder } from "../src/db/apply-migrations.js";
import { getLogger } from "../src/lib/logger.js";

/**
 * Test global setup.
 *
 * Applies the committed migrations to the test database so that every test
 * file starts from the same schema.
 */
export async function setup(): Promise<void> {
  const logger = getLogger();
  const databaseUrl = process.env.TEST_DATABASE_URL!;

  const applied = await applyMigrations(databaseUrl, defaultMigrationsFolder());
  logger.info({ applied: applied.length, databaseUrl }, "Test database prepared");
}

export async function teardown(): Promise<void> {
  // The pool is closed per test file; nothing global to tear down.
}
