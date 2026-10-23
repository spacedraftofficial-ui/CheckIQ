import { getDatabase } from "./client.js";
import { getLogger } from "../lib/logger.js";
import { runSeed } from "./seed.js";

/**
 * Seeds the development database with the default catalogue, roles,
 * permissions and configuration. The same routine is used by the test setup.
 */
async function main(): Promise<void> {
  const { db, pool } = getDatabase();
  try {
    await runSeed(db);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  getLogger().error({ err: error }, "Seed failed");
  process.exitCode = 1;
});
