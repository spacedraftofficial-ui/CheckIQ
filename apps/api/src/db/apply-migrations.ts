import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";
import type { RowDataPacket } from "mysql2";

/**
 * Migration application, shared by the CLI runner and the test setup.
 *
 * MySQL commits implicitly on DDL, so a migration cannot be wrapped in a
 * transaction. Each statement is applied on a single dedicated connection and
 * the migration is recorded in `__drizzle_migrations` using the same format
 * that `drizzle-kit migrate` uses.
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
  const journal = JSON.parse(
    await readFile(resolve(migrationsFolder, "meta/_journal.json"), "utf8"),
  ) as { entries: JournalEntry[] };

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

export async function applyMigrations(
  databaseUrl: string,
  migrationsFolder: string,
): Promise<string[]> {
  const files = await readMigrations(migrationsFolder);
  const applied: string[] = [];

  const connection = await mysql.createConnection({
    uri: databaseUrl,
    timezone: "Z",
    supportBigNumbers: true,
    decimalNumbers: true,
    ssl: databaseUrl.includes("aivencloud.com") ? { rejectUnauthorized: false } : undefined,
  });

  try {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`${MIGRATIONS_TABLE}\` (
        id bigint unsigned NOT NULL AUTO_INCREMENT PRIMARY KEY,
        hash text NOT NULL,
        created_at bigint
      )
    `);

    const [rows] = await connection.query<(RowDataPacket & { hash: string })[]>(
      `SELECT hash FROM \`${MIGRATIONS_TABLE}\``,
    );
    const already = new Set(rows.map((row) => row.hash));

    for (const migration of files) {
      if (already.has(migration.hash)) continue;
      for (const statement of migration.statements) {
        await connection.query(statement);
      }
      await connection.query(
        `INSERT INTO \`${MIGRATIONS_TABLE}\` (hash, created_at) VALUES (?, ?)`,
        [migration.hash, migration.folderMillis],
      );
      applied.push(migration.tag);
    }
  } finally {
    await connection.end();
  }

  return applied;
}

/** Default location of the committed migrations. */
export function defaultMigrationsFolder(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, "../../drizzle");
}
