import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { getConfig } from "../config.js";
import * as schema from "./schema/index.js";

export type Database = ReturnType<typeof createDatabase>;
export type DatabaseClient = Database["db"];

let instance: Database | undefined;

export function createDatabase(url: string, poolSize: number) {
  const isAiven = url.includes("aivencloud.com");
  const pool = mysql.createPool({
    uri: url,
    connectionLimit: poolSize,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    timezone: "Z",
    dateStrings: false,
    supportBigNumbers: true,
    decimalNumbers: true,
    ssl: isAiven ? { rejectUnauthorized: true } : undefined,
  });
  const db = drizzle(pool, { schema, mode: "default" });
  return { pool, db };
}

export function getDatabase(): Database {
  if (instance) return instance;
  const config = getConfig();
  instance = createDatabase(config.DATABASE_URL, config.DATABASE_POOL_SIZE);
  return instance;
}

export async function closeDatabase(): Promise<void> {
  if (!instance) return;
  await instance.pool.end();
  instance = undefined;
}

export { schema };
