import { getDatabase } from "../db/client.js";
import type { RowDataPacket } from "mysql2";

/**
 * Monotonic sequence generator.
 *
 * Uses `LAST_INSERT_ID(expr)` so the increment and the read happen inside a
 * single statement, which keeps the values unique under concurrency.
 */
export async function nextSequence(name: string): Promise<number> {
  const { pool } = getDatabase();
  const connection = await pool.getConnection();
  try {
    await connection.query(
      `INSERT INTO \`sequences\` (\`name\`, \`value\`) VALUES (?, LAST_INSERT_ID(1))
       ON DUPLICATE KEY UPDATE \`value\` = LAST_INSERT_ID(\`value\` + 1)`,
      [name],
    );
    const [rows] = await connection.query<(RowDataPacket & { value: number })[]>(
      `SELECT LAST_INSERT_ID() AS \`value\``,
    );
    return Number(rows[0]?.value ?? 0);
  } finally {
    connection.release();
  }
}

/** Formats a case number such as `BGV-2026-000123`. */
export function formatCaseNumber(sequence: number, now = new Date()): string {
  const year = now.getUTCFullYear();
  return `BGV-${year}-${String(sequence).padStart(6, "0")}`;
}

/** Formats a report number such as `RPT-2026-000123`. */
export function formatReportNumber(sequence: number, now = new Date()): string {
  const year = now.getUTCFullYear();
  return `RPT-${year}-${String(sequence).padStart(6, "0")}`;
}
