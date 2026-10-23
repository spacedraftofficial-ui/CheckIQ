import { eq, inArray } from "drizzle-orm";
import { getDatabase, schema } from "../db/client.js";

/**
 * System configuration access.
 *
 * Values are read from the `system_config` table and cached in memory for a
 * short period so that a configuration change does not require a restart but
 * also does not add a query to every request.
 */

export type ConfigValueType = "STRING" | "NUMBER" | "BOOLEAN" | "JSON";

interface CacheEntry {
  value: string;
  valueType: ConfigValueType;
  expiresAt: number;
}

const CACHE_TTL_MS = 30_000;
const cache = new Map<string, CacheEntry>();

export function clearConfigCache(): void {
  cache.clear();
}

export async function getConfigEntry(key: string): Promise<{ value: string; valueType: ConfigValueType } | null> {
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return { value: cached.value, valueType: cached.valueType };
  }

  const { db } = getDatabase();
  const [row] = await db
    .select({
      value: schema.systemConfig.value,
      valueType: schema.systemConfig.valueType,
    })
    .from(schema.systemConfig)
    .where(eq(schema.systemConfig.key, key))
    .limit(1);

  if (!row) return null;
  const valueType = row.valueType as ConfigValueType;
  cache.set(key, { value: row.value, valueType, expiresAt: Date.now() + CACHE_TTL_MS });
  return { value: row.value, valueType };
}

export async function getConfigValues(keys: string[]): Promise<Record<string, string>> {
  if (keys.length === 0) return {};
  const { db } = getDatabase();
  const rows = await db
    .select({ key: schema.systemConfig.key, value: schema.systemConfig.value })
    .from(schema.systemConfig)
    .where(inArray(schema.systemConfig.key, keys));
  const output: Record<string, string> = {};
  for (const row of rows) output[row.key] = row.value;
  return output;
}

export async function getStringConfig(key: string, fallback: string): Promise<string> {
  const entry = await getConfigEntry(key);
  if (!entry || entry.value === "") return fallback;
  return entry.value;
}

export async function getNumberConfig(key: string, fallback: number): Promise<number> {
  const entry = await getConfigEntry(key);
  if (!entry || entry.value === "") return fallback;
  const parsed = Number(entry.value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function getBooleanConfig(key: string, fallback: boolean): Promise<boolean> {
  const entry = await getConfigEntry(key);
  if (!entry || entry.value === "") return fallback;
  return entry.value === "true";
}

export async function getJsonConfig<T>(key: string, fallback: T): Promise<T> {
  const entry = await getConfigEntry(key);
  if (!entry || entry.value === "") return fallback;
  try {
    return JSON.parse(entry.value) as T;
  } catch {
    return fallback;
  }
}

/** Compiles a configured regular expression, falling back safely if invalid. */
export async function getPatternConfig(key: string, fallback: RegExp): Promise<RegExp> {
  const raw = await getStringConfig(key, fallback.source);
  try {
    return new RegExp(raw);
  } catch {
    return fallback;
  }
}
