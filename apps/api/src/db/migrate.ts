import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";
import type { RowDataPacket } from "mysql2";
import { getConfig } from "../config.js";
import { getLogger } from "../lib/logger.js";

/**
 * Migration runner for MySQL.
 *
 * Drizzle's programmatic migrator wraps the whole migration in a transaction.
 * MySQL commits implicitly on DDL, which breaks that transaction and leaves the
 * bookkeeping table out of sync with the schema. This runner therefore applies
 * each statement on a single dedicated connection, without a transaction, and
 * records the migration in the same `__drizzle_migrations` table and format
 * that `drizzle-kit migrate` uses — so the two remain interchangeable.
 *
 * Migrations are forward-only. Reversing a migration is a separate, explicitly
 * reviewed SQL file.
 */

const MIGRATIONS_TABLE = "__drizzle_migrations";

interface JournalEntry {
  idx: number;
  version: string;
  when: number;
  tag: string;
  breakpoints: boolean;
}

interface MigrationFile {
  tag: string;
  statements: string[];
  folderMillis: number;
  hash: string;
}

async function readMigrations(migrationsFolder: string): Promise<MigrationFile[]> {
  const journalPath = resolve(migrationsFolder, "meta/_journal.json");
  const journal = JSON.parse(await readFile(journalPath, "utf8")) as { entries: JournalEntry[] };

  const migrations: MigrationFile[] = [];
  for (const entry of journal.entries) {
    const sql = await readFile(resolve(migrationsFolder, `${entry.tag}.sql`), "utf8");
    migrations.push({
      tag: entry.tag,
      statements: sql
        .split("--> statement-breakpoint")
        .map((statement) => statement.trim())
        .filter((statement) => statement.length > 0),
      folderMillis: entry.when,
      hash: createHash("sha256").update(sql).digest("hex"),
    });
  }
  return migrations;
}

async function main(): Promise<void> {
  const logger = getLogger();
  const config = getConfig();

  const here = dirname(fileURLToPath(import.meta.url));
  const migrationsFolder = resolve(here, "../../drizzle");

  const files = await readMigrations(migrationsFolder);
  logger.info({ count: files.length, migrationsFolder }, "Applying database migrations");

  const connection = await mysql.createConnection({
    uri: config.DATABASE_URL,
    timezone: "Z",
    supportBigNumbers: true,
    decimalNumbers: true,
  });

  try {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`${MIGRATIONS_TABLE}\` (
        id bigint unsigned NOT NULL AUTO_INCREMENT PRIMARY KEY,
        hash text NOT NULL,
        created_at bigint
      )
    `);

    const [rows] = await connection.query<(RowDataPacket & { hash: string; created_at: number })[]>(
      `SELECT hash, created_at FROM \`${MIGRATIONS_TABLE}\` ORDER BY created_at DESC`,
    );
    const applied = new Set(rows.map((row) => row.hash));

    for (const migration of files) {
      if (applied.has(migration.hash)) {
        logger.info({ migration: migration.tag }, "Migration already applied");
        continue;
      }

      for (const statement of migration.statements) {
        try {
          await connection.query(statement);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          logger.error(
            { migration: migration.tag, err: message },
            "Migration statement failed. MySQL DDL is not transactional, so the schema may be partially applied. Reset the database and re-run.",
          );
          throw error;
        }
      }

      await connection.query(
        `INSERT INTO \`${MIGRATIONS_TABLE}\` (hash, created_at) VALUES (?, ?)`,
        [migration.hash, migration.folderMillis],
      );
      logger.info({ migration: migration.tag }, "Migration applied");
    }

    logger.info("Migrations applied successfully");
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  const logger = getLogger();
  logger.error({ err: error }, "Migration failed");
  process.exitCode = 1;
});
