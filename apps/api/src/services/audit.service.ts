import type { AuditAction } from "@checkiq/contracts";
import { getDatabase, schema } from "../db/client.js";
import { newId } from "../lib/ids.js";
import type { Tx } from "../db/types.js";

/**
 * Append-only audit trail.
 *
 * There is no update or delete path for audit events. The only write path is
 * this function, and the API exposes read-only routes over the table.
 */

/** Keys whose values are never written to the audit trail. */
const REDACTED_KEYS = new Set([
  "password",
  "confirmPassword",
  "currentPassword",
  "newPassword",
  "passwordHash",
  "token",
  "refreshToken",
  "accessToken",
  "otp",
  "otpCode",
  "pan",
  "panEncrypted",
  "passportNumber",
  "passportNumberEncrypted",
  "drivingLicenceNumberEncrypted",
  "contactEmailEncrypted",
  "contactMobileEncrypted",
  "checksumSha256",
  "storageKey",
]);

function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[truncated]";
  if (value === null || value === undefined) return value ?? null;
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => sanitize(item, depth + 1));
  if (typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      output[key] = REDACTED_KEYS.has(key) ? "[REDACTED]" : sanitize(entry, depth + 1);
    }
    return output;
  }
  return value;
}

export interface AuditInput {
  action: AuditAction | string;
  actorId?: string | null;
  actorName?: string | null;
  actorRole?: string | null;
  entityType: string;
  entityId?: string | null;
  caseId?: string | null;
  candidateId?: string | null;
  previousValue?: unknown;
  newValue?: unknown;
  reason?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
}

/**
 * Records an audit event.
 *
 * When a transaction is supplied the event is written inside that transaction,
 * so the audit record and the business change commit or roll back together.
 * A failure to write the audit event fails the surrounding operation.
 */
export async function recordAudit(input: AuditInput, tx?: Tx): Promise<void> {
  const executor = tx ?? getDatabase().db;
  await executor.insert(schema.auditEvents).values({
    id: newId(),
    action: input.action,
    actorId: input.actorId ?? null,
    actorName: input.actorName ?? null,
    actorRole: input.actorRole ?? null,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    caseId: input.caseId ?? null,
    candidateId: input.candidateId ?? null,
    previousValue: input.previousValue === undefined ? null : sanitize(input.previousValue),
    newValue: input.newValue === undefined ? null : sanitize(input.newValue),
    reason: input.reason ?? null,
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ?? null,
    requestId: input.requestId ?? null,
  });
}
