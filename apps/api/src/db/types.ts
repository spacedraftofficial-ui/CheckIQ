import type { MySql2Database } from "drizzle-orm/mysql2";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { schema } from "./client.js";

/** The Drizzle database type. */
export type Db = MySql2Database<typeof schema>;

/** A transaction handle. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export type SchemaRelations = ExtractTablesWithRelations<typeof schema>;
