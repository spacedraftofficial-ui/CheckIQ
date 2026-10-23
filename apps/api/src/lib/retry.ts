/**
 * Retry helper for transient MySQL conflicts.
 *
 * A deadlock (`ER_LOCK_DEADLOCK`) is a normal, transient condition when two
 * transactions contend for the same rows: MySQL rolls the victim back and
 * expects the application to try again. Surfacing it as a server error would
 * be wrong — the operation did not fail on its merits, it lost a race.
 */

const DEADLOCK_CODES = new Set(["ER_LOCK_DEADLOCK"]);
const DEADLOCK_ERRNOS = new Set([1213]);

/** True when the error is a deadlock, looking through the Drizzle error wrapper. */
export function isDeadlock(error: unknown): boolean {
  const candidates: unknown[] = [error];
  let current = error as { cause?: unknown } | undefined;
  for (let depth = 0; depth < 5 && current?.cause; depth += 1) {
    candidates.push(current.cause);
    current = current.cause as { cause?: unknown };
  }

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") continue;
    const value = candidate as { code?: string; errno?: number };
    if (value.code && DEADLOCK_CODES.has(value.code)) return true;
    if (value.errno !== undefined && DEADLOCK_ERRNOS.has(value.errno)) return true;
  }
  return false;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Runs an operation, retrying it when it loses a deadlock.
 *
 * The backoff is randomised so that two transactions that deadlock do not
 * immediately collide again in the same order.
 */
export async function withDeadlockRetry<T>(
  operation: () => Promise<T>,
  attempts = 3,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!isDeadlock(error)) throw error;
      lastError = error;
      await sleep(15 * (attempt + 1) + Math.floor(Math.random() * 25));
    }
  }

  throw lastError;
}
