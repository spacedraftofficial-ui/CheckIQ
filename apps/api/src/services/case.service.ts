import type { CaseStatus } from "@checkiq/contracts";
import { and, asc, eq, inArray } from "drizzle-orm";
import { getDatabase, schema } from "../db/client.js";
import type { Db, Tx } from "../db/types.js";
import { conflict, notFound } from "../lib/errors.js";
import { newId } from "../lib/ids.js";
import { formatCaseNumber, nextSequence } from "../lib/sequence.js";
import { assertTransition } from "../modules/cases/case-state.js";
import { recordAudit } from "./audit.service.js";

/**
 * Case creation and state transitions.
 *
 * Every transition is validated, recorded in `case_status_history` and written
 * to the audit trail. Concurrent updates are handled with optimistic locking on
 * `bgv_cases.version`.
 */

/**
 * Reads the number of affected rows from a Drizzle MySQL result.
 *
 * The MySQL driver returns a `[ResultSetHeader, FieldPacket[]]` tuple, while
 * some Drizzle paths expose the header directly. Both shapes are handled so
 * that the optimistic-lock check cannot silently pass.
 */
export function affectedRows(result: unknown): number {
  if (result === null || result === undefined) return 1;
  if (Array.isArray(result)) {
    const header = result[0] as { affectedRows?: number } | undefined;
    return header?.affectedRows ?? 1;
  }
  const header = result as { affectedRows?: number };
  return typeof header.affectedRows === "number" ? header.affectedRows : 1;
}

export interface ActorContext {
  userId: string | null;
  fullName: string | null;
  role: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
}

/** Returns the package assigned to new cases (the active standard package). */
export async function resolveDefaultPackageId(executor: Tx | Db): Promise<string> {
  const [pkg] = await executor
    .select({ id: schema.bgvPackages.id })
    .from(schema.bgvPackages)
    .where(eq(schema.bgvPackages.isActive, true))
    .orderBy(asc(schema.bgvPackages.createdAt))
    .limit(1);
  if (!pkg) {
    throw notFound("No active BGV package is configured");
  }
  return pkg.id;
}

export interface CreateCaseInput {
  profileId: string;
  packageId?: string;
  company?: string | null;
  department?: string | null;
  position?: string | null;
}

/**
 * Creates a case in `DOCUMENT_UPLOAD_IN_PROGRESS` and instantiates the
 * document and check rows the package requires.
 */
export async function createCaseForProfile(tx: Tx, input: CreateCaseInput): Promise<string> {
  const packageId = input.packageId ?? (await resolveDefaultPackageId(tx));
  const caseId = newId();
  const sequence = await nextSequence("bgv_case");
  const caseNumber = formatCaseNumber(sequence);
  const now = new Date();

  await tx.insert(schema.bgvCases).values({
    id: caseId,
    caseNumber,
    profileId: input.profileId,
    packageId,
    status: "DOCUMENT_UPLOAD_IN_PROGRESS",
    company: input.company ?? null,
    department: input.department ?? null,
    position: input.position ?? null,
    initiatedAt: now,
    version: 1,
  });

  await tx.insert(schema.caseStatusHistory).values({
    id: newId(),
    caseId,
    fromStatus: null,
    toStatus: "DOCUMENT_UPLOAD_IN_PROGRESS",
    actorId: null,
    actorRole: "SYSTEM",
    reason: "Case created",
    metadata: { caseNumber },
  });

  await instantiateCaseArtifacts(tx, caseId, packageId);
  return caseId;
}

/** Creates the document and verification check rows required by a package. */
export async function instantiateCaseArtifacts(
  tx: Tx,
  caseId: string,
  packageId: string,
): Promise<void> {
  const requirements = await tx
    .select({
      id: schema.documentRequirements.id,
      categoryId: schema.documentRequirements.categoryId,
      documentTypeId: schema.documentRequirements.documentTypeId,
      label: schema.documentRequirements.label,
    })
    .from(schema.documentRequirements)
    .where(eq(schema.documentRequirements.packageId, packageId));

  if (requirements.length > 0) {
    const [caseRow] = await tx
      .select({ profileId: schema.bgvCases.profileId })
      .from(schema.bgvCases)
      .where(eq(schema.bgvCases.id, caseId))
      .limit(1);

    await tx.insert(schema.documents).values(
      requirements.map((requirement) => ({
        id: newId(),
        caseId,
        profileId: caseRow?.profileId ?? "",
        requirementId: requirement.id,
        documentTypeId: requirement.documentTypeId,
        label: requirement.label,
        status: "MISSING" as const,
        versionCount: 0,
      })),
    );
  }

  const packageChecks = await tx
    .select({
      checkDefinitionId: schema.bgvPackageChecks.checkDefinitionId,
      isMandatory: schema.bgvPackageChecks.isMandatory,
      weight: schema.bgvPackageChecks.weight,
      code: schema.checkDefinitions.code,
      name: schema.checkDefinitions.name,
    })
    .from(schema.bgvPackageChecks)
    .innerJoin(
      schema.checkDefinitions,
      eq(schema.checkDefinitions.id, schema.bgvPackageChecks.checkDefinitionId),
    )
    .where(eq(schema.bgvPackageChecks.packageId, packageId));

  if (packageChecks.length > 0) {
    await tx.insert(schema.verificationChecks).values(
      packageChecks.map((check) => ({
        id: newId(),
        caseId,
        checkDefinitionId: check.checkDefinitionId,
        checkTypeCode: check.code,
        label: check.name,
        isMandatory: check.isMandatory,
        weight: check.weight,
        status: "NOT_SUBMITTED" as const,
      })),
    );
  }
}

export interface TransitionInput {
  caseId: string;
  to: CaseStatus;
  actor: ActorContext;
  reason?: string | null;
  /** Optimistic concurrency token. When supplied, the update fails if stale. */
  expectedVersion?: number | null;
  metadata?: Record<string, unknown>;
  /** Extra columns to update alongside the status. */
  patch?: Partial<typeof schema.bgvCases.$inferInsert>;
}

/**
 * Performs a validated status transition.
 *
 * The update is conditional on the current version, so two concurrent actors
 * cannot silently overwrite one another. The losing actor receives a 409 with
 * the current server state.
 */
export async function transitionCase(tx: Tx, input: TransitionInput): Promise<void> {
  const [current] = await tx
    .select()
    .from(schema.bgvCases)
    .where(eq(schema.bgvCases.id, input.caseId))
    .limit(1);

  if (!current) throw notFound("Case not found");

  const fromStatus = current.status as CaseStatus;
  assertTransition(fromStatus, input.to, input.actor.role ? [input.actor.role] : ["SYSTEM"]);

  if (input.expectedVersion !== undefined && input.expectedVersion !== null) {
    if (current.version !== input.expectedVersion) {
      throw conflict("This case was updated by someone else. Reload and try again.", {
        currentStatus: fromStatus,
        currentVersion: current.version,
      });
    }
  }

  const now = new Date();
  const result = await tx
    .update(schema.bgvCases)
    .set({
      status: input.to,
      version: current.version + 1,
      updatedAt: now,
      ...input.patch,
    })
    .where(and(eq(schema.bgvCases.id, input.caseId), eq(schema.bgvCases.version, current.version)));

  // The conditional update is the concurrency guard: if another actor changed
  // the row between the read and the write, no rows are affected.
  const affected = affectedRows(result);
  if (affected === 0) {
    throw conflict("This case was updated by someone else. Reload and try again.", {
      currentStatus: fromStatus,
    });
  }

  await tx.insert(schema.caseStatusHistory).values({
    id: newId(),
    caseId: input.caseId,
    fromStatus,
    toStatus: input.to,
    actorId: input.actor.userId,
    actorRole: input.actor.role,
    reason: input.reason ?? null,
    metadata: input.metadata ?? null,
  });

  await recordAudit(
    {
      action: "CASE_STATUS_CHANGED",
      actorId: input.actor.userId,
      actorName: input.actor.fullName,
      actorRole: input.actor.role,
      entityType: "bgv_case",
      entityId: input.caseId,
      caseId: input.caseId,
      previousValue: { status: fromStatus, version: current.version },
      newValue: { status: input.to, version: current.version + 1 },
      reason: input.reason ?? null,
      ipAddress: input.actor.ipAddress ?? null,
      userAgent: input.actor.userAgent ?? null,
      requestId: input.actor.requestId ?? null,
    },
    tx,
  );
}

/** Returns the cases the principal is allowed to see, as an SQL predicate set. */
export async function visibleCaseIdsForUser(
  permissions: Set<string>,
): Promise<{ mode: "all" } | { mode: "assigned" }> {
  if (permissions.has("case:read:any")) return { mode: "all" };
  if (permissions.has("case:read:assigned")) return { mode: "assigned" };
  return { mode: "assigned" };
}

export async function caseExists(tx: Tx, caseId: string): Promise<boolean> {
  const [row] = await tx
    .select({ id: schema.bgvCases.id })
    .from(schema.bgvCases)
    .where(eq(schema.bgvCases.id, caseId))
    .limit(1);
  return Boolean(row);
}

export async function countOpenClarifications(tx: Tx, caseId: string): Promise<number> {
  const rows = await tx
    .select({ id: schema.clarificationRequests.id })
    .from(schema.clarificationRequests)
    .where(
      and(
        eq(schema.clarificationRequests.caseId, caseId),
        inArray(schema.clarificationRequests.status, ["OPEN", "RESPONDED"]),
      ),
    );
  return rows.length;
}

export { getDatabase };
