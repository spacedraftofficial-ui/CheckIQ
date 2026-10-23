import type { SubmitCaseResponse } from "@checkiq/contracts";
import { and, eq, inArray } from "drizzle-orm";
import { getDatabase, schema } from "../../db/client.js";
import { conflict, preconditionFailed } from "../../lib/errors.js";
import { newId } from "../../lib/ids.js";
import { withDeadlockRetry } from "../../lib/retry.js";
import { recordAudit } from "../../services/audit.service.js";
import { evaluateReadiness } from "../../services/readiness.service.js";
import { transitionCase } from "../../services/case.service.js";
import { queueNotification } from "../../services/notification.service.js";
import type { Principal } from "../../types/express.js";

/**
 * Case submission.
 *
 * Submission is idempotent. A client-generated idempotency key is stored with
 * the submission event and a unique constraint on the case guarantees that a
 * case can only be submitted once — repeated clicks and network retries return
 * the original result rather than creating a second submission.
 */
export async function submitCase(
  caseId: string,
  idempotencyKey: string,
  principal: Principal,
): Promise<SubmitCaseResponse> {
  const { db } = getDatabase();

  const [caseRow] = await db
    .select()
    .from(schema.bgvCases)
    .where(eq(schema.bgvCases.id, caseId))
    .limit(1);
  if (!caseRow) throw conflict("Case not found");

  const [existing] = await db
    .select()
    .from(schema.bgvSubmissionEvents)
    .where(eq(schema.bgvSubmissionEvents.caseId, caseId))
    .limit(1);

  if (existing) {
    if (existing.idempotencyKey === idempotencyKey) {
      // Same request replayed — return the original outcome.
      return {
        caseId,
        caseNumber: caseRow.caseNumber,
        status: caseRow.status as SubmitCaseResponse["status"],
        submittedAt: existing.submittedAt.toISOString(),
        alreadySubmitted: true,
      };
    }
    throw conflict("This case has already been submitted.", {
      submittedAt: existing.submittedAt.toISOString(),
      caseNumber: caseRow.caseNumber,
    });
  }

  if (caseRow.status !== "DOCUMENT_UPLOAD_IN_PROGRESS") {
    throw conflict("This case is not in a state that can be submitted.", {
      status: caseRow.status as SubmitCaseResponse["status"],
    });
  }

  const readiness = await evaluateReadiness(caseId);
  if (!readiness.ready) {
    throw preconditionFailed("Some required information is still outstanding.", readiness.missing);
  }

  const submittedAt = new Date();

  try {
    await withDeadlockRetry(() =>
      db.transaction(async (tx) => {
        await tx.insert(schema.bgvSubmissionEvents).values({
          id: newId(),
          caseId,
          idempotencyKey,
          submittedBy: principal.userId,
          submittedAt,
          readinessSnapshot: readiness as unknown as Record<string, unknown>,
        });

        await transitionCase(
          tx,
          {
            caseId,
            to: "SUBMITTED",
            actor: {
              userId: principal.userId,
              fullName: principal.fullName,
              role: "CANDIDATE",
            },
            reason: "Candidate submitted the background verification information",
            metadata: { idempotencyKey },
            patch: { submittedAt },
          },
        );

        // The checks are now in scope for verification.
        await tx
          .update(schema.verificationChecks)
          .set({ status: "SUBMITTED", updatedAt: new Date() })
          .where(
            and(
              eq(schema.verificationChecks.caseId, caseId),
              eq(schema.verificationChecks.status, "NOT_SUBMITTED"),
            ),
          );

        await recordAudit(
          {
            action: "CASE_SUBMITTED",
            actorId: principal.userId,
            actorName: principal.fullName,
            actorRole: "CANDIDATE",
            entityType: "bgv_case",
            entityId: caseId,
            caseId,
            candidateId: principal.candidateId,
            newValue: { status: "SUBMITTED", submittedAt: submittedAt.toISOString() },
            ipAddress: undefined,
            requestId: undefined,
          },
          tx,
        );
      }),
    );
  } catch (error) {
    // Two concurrent submissions race for the unique constraint on the case.
    // The winner's submission is authoritative, so the outcome is read back
    // rather than guessed at.
    const [winner] = await db
      .select()
      .from(schema.bgvSubmissionEvents)
      .where(eq(schema.bgvSubmissionEvents.caseId, caseId))
      .limit(1);
    if (winner) {
      return {
        caseId,
        caseNumber: caseRow.caseNumber,
        status: "SUBMITTED" as SubmitCaseResponse["status"],
        submittedAt: winner.submittedAt.toISOString(),
        alreadySubmitted: true,
      };
    }
    throw error;
  }

  // Notifications are queued after the transaction commits. A delivery failure
  // never rolls the submission back.
  await queueNotification({
    event: "CASE_SUBMITTED",
    recipientUserId: principal.userId,
    recipientEmail: principal.email,
    caseId,
    deduplicationKey: idempotencyKey,
    variables: {
      candidateName: principal.fullName,
      candidateId: principal.candidateId ?? "",
      caseNumber: caseRow.caseNumber,
    },
  });

  return {
    caseId,
    caseNumber: caseRow.caseNumber,
    status: "SUBMITTED",
    submittedAt: submittedAt.toISOString(),
    alreadySubmitted: false,
  };
}

/** Lists the checks of a case in a stable order. */
export async function listCaseCheckIds(caseId: string): Promise<string[]> {
  const { db } = getDatabase();
  const rows = await db
    .select({ id: schema.verificationChecks.id })
    .from(schema.verificationChecks)
    .where(eq(schema.verificationChecks.caseId, caseId));
  return rows.map((row) => row.id);
}

export async function countUnresolvedChecks(caseId: string): Promise<number> {
  const { db } = getDatabase();
  const rows = await db
    .select({ id: schema.verificationChecks.id })
    .from(schema.verificationChecks)
    .where(
      and(
        eq(schema.verificationChecks.caseId, caseId),
        inArray(schema.verificationChecks.status, [
          "NOT_SUBMITTED",
          "SUBMITTED",
          "UNDER_VERIFICATION",
          "CLARIFICATION_REQUIRED",
        ]),
      ),
    );
  return rows.length;
}
