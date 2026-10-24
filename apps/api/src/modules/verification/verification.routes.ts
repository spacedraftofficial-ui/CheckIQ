import { Router } from "express";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import {
  clarificationClosureSchema,
  clarificationRequestSchema,
  clarificationResponseSchema,
  recordCheckResultSchema,
} from "@checkiq/contracts";
import { getDatabase, schema } from "../../db/client.js";
import { param } from "../../lib/request.js";
import { requirePermission, requirePrincipal } from "../../middleware/authenticate.js";
import { validate } from "../../middleware/validate.js";
import {
  conflict,
  forbidden,
  notFound,
  preconditionFailed,
  validationError,
} from "../../lib/errors.js";
import { newId } from "../../lib/ids.js";
import { withDeadlockRetry } from "../../lib/retry.js";
import { getLogger } from "../../lib/logger.js";
import { recordAudit } from "../../services/audit.service.js";
import { resolveCase } from "../../services/access.service.js";
import { transitionCase } from "../../services/case.service.js";
import { notifyCandidate, queueNotification } from "../../services/notification.service.js";
import { CANDIDATE_VISIBLE_STATUSES } from "../cases/case-state.js";
import { generateScore } from "../scoring/scoring.service.js";

export const verificationRouter = Router();

const caseParams = z.object({ caseId: z.string().uuid() });
const checkParams = z.object({
  caseId: z.string().uuid(),
  checkId: z.string().uuid(),
});
const clarificationParams = z.object({ clarificationId: z.string().uuid() });

/**
 * POST /api/cases/:caseId/verification/start
 *
 * Moves a submitted case into verification. The case must have a verifier.
 */
verificationRouter.post(
  "/cases/:caseId/verification/start",
  requirePrincipal,
  requirePermission("verification:record"),
  validate({ params: caseParams }),
  async (req, res) => {
    const { caseRow } = await resolveCase(req.principal!, param(req, "caseId"));

    if (!caseRow.assignedVerifierId) {
      throw preconditionFailed(
        "Assign a verifier to this case before starting verification.",
      );
    }

    await getDatabase().db.transaction(async (tx) => {
      await transitionCase(tx, {
        caseId: caseRow.id,
        to: "VERIFICATION_IN_PROGRESS",
        actor: {
          userId: req.principal!.userId,
          fullName: req.principal!.fullName,
          role: req.principal!.roles[0] ?? null,
        },
        reason: "Verification started",
        patch: { verificationStartedAt: new Date() },
      });
    });

    await notifyCandidate(
      caseRow.profileId,
      "VERIFICATION_IN_PROGRESS",
      { caseNumber: caseRow.caseNumber },
      { caseId: caseRow.id, deduplicationKey: `verification-started-${caseRow.id}` },
    );

    res.status(200).json({ data: { caseId: caseRow.id, status: "VERIFICATION_IN_PROGRESS" } });
  },
);

/**
 * POST /api/cases/:caseId/verification/complete
 *
 * Marks the verification work as complete. Every mandatory check must be
 * resolved and no clarification may still be open.
 */
verificationRouter.post(
  "/cases/:caseId/verification/complete",
  requirePrincipal,
  requirePermission("verification:record"),
  validate({ params: caseParams }),
  async (req, res) => {
    const { caseRow } = await resolveCase(req.principal!, param(req, "caseId"));
    const { db } = getDatabase();

    const unresolved = await db
      .select({ id: schema.verificationChecks.id, label: schema.verificationChecks.label })
      .from(schema.verificationChecks)
      .where(
        and(
          eq(schema.verificationChecks.caseId, caseRow.id),
          eq(schema.verificationChecks.isMandatory, true),
          inArray(schema.verificationChecks.status, [
            "NOT_SUBMITTED",
            "SUBMITTED",
            "UNDER_VERIFICATION",
            "CLARIFICATION_REQUIRED",
          ]),
        ),
      );

    if (unresolved.length > 0) {
      throw preconditionFailed(
        "Every mandatory check must have a recorded outcome before verification can be completed.",
        { unresolvedChecks: unresolved },
      );
    }

    const openClarifications = await db
      .select({ id: schema.clarificationRequests.id })
      .from(schema.clarificationRequests)
      .where(
        and(
          eq(schema.clarificationRequests.caseId, caseRow.id),
          inArray(schema.clarificationRequests.status, ["OPEN", "RESPONDED"]),
        ),
      );

    if (openClarifications.length > 0) {
      throw preconditionFailed("A clarification request is still open for this case.", {
        openClarifications: openClarifications.length,
      });
    }

    await db.transaction(async (tx) => {
      await transitionCase(tx, {
        caseId: caseRow.id,
        to: "VERIFICATION_COMPLETED",
        actor: {
          userId: req.principal!.userId,
          fullName: req.principal!.fullName,
          role: req.principal!.roles[0] ?? null,
        },
        reason: "Verification completed",
        patch: { verificationCompletedAt: new Date() },
      });
    });

    await notifyCandidate(
      caseRow.profileId,
      "BGV_COMPLETED",
      { caseNumber: caseRow.caseNumber },
      { caseId: caseRow.id, deduplicationKey: `verification-completed-${caseRow.id}` },
    );

    try {
      await generateScore(caseRow.id, {
        userId: req.principal!.userId,
        fullName: req.principal!.fullName,
        role: req.principal!.roles[0] ?? null,
      });
    } catch (err) {
      getLogger().warn(
        { caseId: caseRow.id, err },
        "Automatic score generation failed after verification completed — it can be retried from the verification page",
      );
    }

    res.status(200).json({ data: { caseId: caseRow.id, status: "VERIFICATION_COMPLETED" } });
  },
);

/**
 * GET /api/cases/:caseId/checks
 *
 * Lists the verification checks of a case. A candidate sees only the coarse
 * status of each check — never the internal findings or remarks.
 */
verificationRouter.get(
  "/cases/:caseId/checks",
  requirePrincipal,
  validate({ params: caseParams }),
  async (req, res) => {
    const { caseRow } = await resolveCase(req.principal!, param(req, "caseId"));
    const { db } = getDatabase();
    const rows = await db
      .select({
        id: schema.verificationChecks.id,
        checkTypeCode: schema.verificationChecks.checkTypeCode,
        label: schema.verificationChecks.label,
        isMandatory: schema.verificationChecks.isMandatory,
        status: schema.verificationChecks.status,
        outcomeCode: schema.verificationChecks.outcomeCode,
        remarks: schema.verificationChecks.remarks,
        evidenceReference: schema.verificationChecks.evidenceReference,
        requiresReview: schema.verificationChecks.requiresReview,
        startedAt: schema.verificationChecks.startedAt,
        completedAt: schema.verificationChecks.completedAt,
        verifierId: schema.verificationChecks.verifierId,
        verifierName: schema.users.fullName,
        updatedAt: schema.verificationChecks.updatedAt,
      })
      .from(schema.verificationChecks)
      .leftJoin(schema.users, eq(schema.users.id, schema.verificationChecks.verifierId))
      .where(eq(schema.verificationChecks.caseId, caseRow.id))
      .orderBy(asc(schema.verificationChecks.createdAt));

    const isCandidate = req.principal!.candidateProfileId === caseRow.profileId;
    const canSeeFindings = !isCandidate && req.principal!.permissions.has("verification:read" as never);

    res.status(200).json({
      data: rows.map((row) => ({
        id: row.id,
        caseId: caseRow.id,
        checkTypeCode: row.checkTypeCode,
        label: row.label,
        isMandatory: row.isMandatory,
        weight: 0,
        status: row.status,
        outcomeCode: canSeeFindings ? row.outcomeCode : null,
        verifierId: canSeeFindings ? row.verifierId : null,
        verifierName: canSeeFindings ? row.verifierName : null,
        remarks: canSeeFindings ? row.remarks : null,
        evidenceReference: canSeeFindings ? row.evidenceReference : null,
        requiresReview: canSeeFindings ? row.requiresReview : false,
        startedAt: row.startedAt?.toISOString() ?? null,
        completedAt: row.completedAt?.toISOString() ?? null,
        createdAt: row.updatedAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      })),
    });
  },
);

/**
 * GET /api/cases/:caseId/checks/:checkId/results
 *
 * The full, append-only history of results recorded against a check.
 */
verificationRouter.get(
  "/cases/:caseId/checks/:checkId/results",
  requirePrincipal,
  requirePermission("verification:read"),
  validate({ params: checkParams }),
  async (req, res) => {
    await resolveCase(req.principal!, param(req, "caseId"));
    const { db } = getDatabase();
    const rows = await db
      .select({
        id: schema.verificationCheckResults.id,
        sequence: schema.verificationCheckResults.sequence,
        status: schema.verificationCheckResults.status,
        outcomeCode: schema.verificationCheckResults.outcomeCode,
        remarks: schema.verificationCheckResults.remarks,
        evidenceReference: schema.verificationCheckResults.evidenceReference,
        requiresReview: schema.verificationCheckResults.requiresReview,
        recordedBy: schema.verificationCheckResults.recordedBy,
        recordedAt: schema.verificationCheckResults.recordedAt,
        isCurrent: schema.verificationCheckResults.isCurrent,
        recorderName: schema.users.fullName,
      })
      .from(schema.verificationCheckResults)
      .leftJoin(schema.users, eq(schema.users.id, schema.verificationCheckResults.recordedBy))
      .where(eq(schema.verificationCheckResults.checkId, param(req, "checkId")))
      .orderBy(asc(schema.verificationCheckResults.sequence));

    res.status(200).json({
      data: rows.map((row) => ({
        id: row.id,
        sequence: row.sequence,
        status: row.status,
        outcomeCode: row.outcomeCode,
        remarks: row.remarks,
        evidenceReference: row.evidenceReference,
        requiresReview: row.requiresReview,
        recordedBy: row.recordedBy,
        recordedByName: row.recorderName,
        recordedAt: row.recordedAt.toISOString(),
        isCurrent: row.isCurrent,
      })),
    });
  },
);

/**
 * POST /api/cases/:caseId/checks/:checkId/result
 *
 * Records the outcome of a check. The previous result is preserved, never
 * overwritten.
 */
verificationRouter.post(
  "/cases/:caseId/checks/:checkId/result",
  requirePrincipal,
  requirePermission("verification:record"),
  validate({ params: checkParams, body: recordCheckResultSchema }),
  async (req, res) => {
    const { caseRow } = await resolveCase(req.principal!, param(req, "caseId"));
    const { db } = getDatabase();

    const [check] = await db
      .select()
      .from(schema.verificationChecks)
      .where(
        and(
          eq(schema.verificationChecks.id, param(req, "checkId")),
          eq(schema.verificationChecks.caseId, caseRow.id),
        ),
      )
      .limit(1);
    if (!check) throw notFound("Check not found");

    if (
      caseRow.assignedVerifierId &&
      caseRow.assignedVerifierId !== req.principal!.userId &&
      !req.principal!.permissions.has("verification:read" as never)
    ) {
      throw forbidden("This check is assigned to another verifier");
    }

    const body = req.body;
    if (
      (body.status === "DISCREPANCY_FOUND" || body.status === "REJECTED" || body.status === "UNABLE_TO_VERIFY") &&
      !body.remarks
    ) {
      throw validationError("Remarks are required for this outcome");
    }

    const resultId = newId();
    const now = new Date();
    let sequence = 0;

    await withDeadlockRetry(() =>
      db.transaction(async (tx) => {
        // The next sequence number is allocated with a row lock so that two
        // concurrent verifications cannot claim the same sequence.
        const locked = await tx.execute<{ sequence: number }>(
          sql`SELECT COALESCE(MAX(\`sequence\`), 0) AS \`sequence\`
                FROM \`verification_check_results\`
               WHERE \`check_id\` = ${check.id}
               FOR UPDATE`,
        );
        sequence = readFirstNumber(locked, "sequence") + 1;

        await tx
          .update(schema.verificationCheckResults)
          .set({ isCurrent: false })
          .where(
            and(
              eq(schema.verificationCheckResults.checkId, check.id),
              eq(schema.verificationCheckResults.isCurrent, true),
            ),
          );

        await tx.insert(schema.verificationCheckResults).values({
          id: resultId,
          checkId: check.id,
          sequence,
          status: body.status,
          outcomeCode: body.outcomeCode ?? null,
          remarks: body.remarks ?? null,
          evidenceReference: body.evidenceReference ?? null,
          requiresReview: body.requiresReview ?? body.status === "DISCREPANCY_FOUND",
          recordedBy: req.principal!.userId,
          recordedAt: now,
          isCurrent: true,
        });

        await tx
          .update(schema.verificationChecks)
          .set({
            status: body.status,
            outcomeCode: body.outcomeCode ?? null,
            remarks: body.remarks ?? null,
            evidenceReference: body.evidenceReference ?? null,
            requiresReview: body.requiresReview ?? body.status === "DISCREPANCY_FOUND",
            verifierId: req.principal!.userId,
            startedAt: check.startedAt ?? now,
            completedAt: now,
            updatedAt: now,
          })
          .where(eq(schema.verificationChecks.id, check.id));

        await recordAudit(
          {
            action: "VERIFICATION_RECORDED",
            actorId: req.principal!.userId,
            actorName: req.principal!.fullName,
            actorRole: req.principal!.roles[0] ?? null,
            entityType: "verification_check",
            entityId: check.id,
            caseId: caseRow.id,
            previousValue: { status: check.status, outcomeCode: check.outcomeCode },
            newValue: { status: body.status, outcomeCode: body.outcomeCode ?? null },
            ipAddress: req.ipAddress ?? null,
            userAgent: req.userAgent ?? null,
            requestId: req.requestId,
          },
          tx,
        );
      }),
    );

    res.status(201).json({ data: { id: resultId, sequence, status: body.status } });
  },
);

/**
 * GET /api/cases/:caseId/clarifications
 */
verificationRouter.get(
  "/cases/:caseId/clarifications",
  requirePrincipal,
  validate({ params: caseParams }),
  async (req, res) => {
    const { caseRow } = await resolveCase(req.principal!, param(req, "caseId"));
    const { db } = getDatabase();
    const rows = await db
      .select({
        id: schema.clarificationRequests.id,
        checkId: schema.clarificationRequests.checkId,
        documentId: schema.clarificationRequests.documentId,
        issueSummary: schema.clarificationRequests.issueSummary,
        requiredAction: schema.clarificationRequests.requiredAction,
        remarks: schema.clarificationRequests.remarks,
        dueDate: schema.clarificationRequests.dueDate,
        status: schema.clarificationRequests.status,
        requestedAt: schema.clarificationRequests.requestedAt,
        respondedAt: schema.clarificationRequests.respondedAt,
        responseText: schema.clarificationRequests.responseText,
        closedAt: schema.clarificationRequests.closedAt,
        closeReason: schema.clarificationRequests.closeReason,
        requestedByName: schema.users.fullName,
      })
      .from(schema.clarificationRequests)
      .leftJoin(schema.users, eq(schema.users.id, schema.clarificationRequests.requestedBy))
      .where(eq(schema.clarificationRequests.caseId, caseRow.id))
      .orderBy(asc(schema.clarificationRequests.requestedAt));

    res.status(200).json({
      data: rows.map((row) => ({
        id: row.id,
        caseId: caseRow.id,
        checkId: row.checkId,
        documentId: row.documentId,
        issueSummary: row.issueSummary,
        requiredAction: row.requiredAction,
        remarks: row.remarks,
        dueDate: row.dueDate,
        status: row.status,
        requestedById: row.requestedByName ?? "",
        requestedByName: row.requestedByName,
        requestedAt: row.requestedAt.toISOString(),
        respondedAt: row.respondedAt?.toISOString() ?? null,
        responseText: row.responseText,
        responseDocumentIds: [],
        closedAt: row.closedAt?.toISOString() ?? null,
        closedById: null,
        closeReason: row.closeReason,
        isOverdue:
          row.dueDate !== null &&
          new Date(row.dueDate).getTime() < Date.now() &&
          row.status !== "CLOSED",
      })),
    });
  },
);

/**
 * POST /api/cases/:caseId/clarifications
 *
 * Raises a clarification request against a check and/or a document.
 */
verificationRouter.post(
  "/cases/:caseId/clarifications",
  requirePrincipal,
  requirePermission("clarification:create"),
  validate({ params: caseParams, body: clarificationRequestSchema }),
  async (req, res) => {
    const { caseRow, profile } = await resolveCase(req.principal!, param(req, "caseId"));
    const { db } = getDatabase();

    if (req.body.checkId) {
      const [check] = await db
        .select({ id: schema.verificationChecks.id })
        .from(schema.verificationChecks)
        .where(
          and(
            eq(schema.verificationChecks.id, req.body.checkId),
            eq(schema.verificationChecks.caseId, caseRow.id),
          ),
        )
        .limit(1);
      if (!check) throw validationError("The selected check does not belong to this case");
    }
    if (req.body.documentId) {
      const [document] = await db
        .select({ id: schema.documents.id })
        .from(schema.documents)
        .where(
          and(
            eq(schema.documents.id, req.body.documentId),
            eq(schema.documents.caseId, caseRow.id),
          ),
        )
        .limit(1);
      if (!document) throw validationError("The selected document does not belong to this case");
    }

    const clarificationId = newId();
    const now = new Date();

    await db.transaction(async (tx) => {
      await tx.insert(schema.clarificationRequests).values({
        id: clarificationId,
        caseId: caseRow.id,
        checkId: req.body.checkId ?? null,
        documentId: req.body.documentId ?? null,
        issueSummary: req.body.issueSummary,
        requiredAction: req.body.requiredAction,
        remarks: req.body.remarks ?? null,
        dueDate: req.body.dueDate ?? null,
        status: "OPEN",
        requestedBy: req.principal!.userId,
        requestedAt: now,
      });

      if (req.body.checkId) {
        await tx
          .update(schema.verificationChecks)
          .set({ status: "CLARIFICATION_REQUIRED", updatedAt: now })
          .where(eq(schema.verificationChecks.id, req.body.checkId));
      }
      if (req.body.documentId) {
        await tx
          .update(schema.documents)
          .set({ status: "CLARIFICATION_REQUIRED", updatedAt: now })
          .where(eq(schema.documents.id, req.body.documentId));
      }

      if (caseRow.status === "VERIFICATION_IN_PROGRESS" || caseRow.status === "SUBMITTED") {
        await transitionCase(tx, {
          caseId: caseRow.id,
          to: "CLARIFICATION_REQUIRED",
          actor: {
            userId: req.principal!.userId,
            fullName: req.principal!.fullName,
            role: req.principal!.roles[0] ?? null,
          },
          reason: `Clarification requested: ${req.body.issueSummary}`,
        });
      }

      await recordAudit(
        {
          action: "CLARIFICATION_REQUESTED",
          actorId: req.principal!.userId,
          actorName: req.principal!.fullName,
          actorRole: req.principal!.roles[0] ?? null,
          entityType: "clarification_request",
          entityId: clarificationId,
          caseId: caseRow.id,
          candidateId: profile.candidateId,
          newValue: {
            checkId: req.body.checkId ?? null,
            documentId: req.body.documentId ?? null,
            issueSummary: req.body.issueSummary,
            dueDate: req.body.dueDate ?? null,
          },
          ipAddress: req.ipAddress ?? null,
          userAgent: req.userAgent ?? null,
          requestId: req.requestId,
        },
        tx,
      );
    });

    const [candidate] = await db
      .select({ id: schema.users.id, email: schema.users.email, fullName: schema.users.fullName })
      .from(schema.users)
      .where(eq(schema.users.id, profile.userId))
      .limit(1);

    if (candidate) {
      await queueNotification({
        event: "CLARIFICATION_REQUESTED",
        recipientUserId: candidate.id,
        recipientEmail: candidate.email,
        caseId: caseRow.id,
        deduplicationKey: clarificationId,
        variables: {
          candidateName: candidate.fullName,
          caseNumber: caseRow.caseNumber,
          issueSummary: req.body.issueSummary,
          requiredAction: req.body.requiredAction,
        },
      });
    }

    res.status(201).json({ data: { id: clarificationId, status: "OPEN" } });
  },
);

/**
 * POST /api/clarifications/:clarificationId/respond
 *
 * The candidate responds to a clarification. A response after the due date is
 * accepted and recorded as late.
 */
verificationRouter.post(
  "/clarifications/:clarificationId/respond",
  requirePrincipal,
  requirePermission("clarification:respond:own"),
  validate({ params: clarificationParams, body: clarificationResponseSchema }),
  async (req, res) => {
    const { db } = getDatabase();
    const [clarification] = await db
      .select()
      .from(schema.clarificationRequests)
      .where(eq(schema.clarificationRequests.id, param(req, "clarificationId")))
      .limit(1);
    if (!clarification) throw notFound("Clarification request not found");

    const { caseRow } = await resolveCase(req.principal!, clarification.caseId);
    if (req.principal!.candidateProfileId !== caseRow.profileId) {
      throw forbidden("Only the candidate can respond to this clarification");
    }
    if (clarification.status === "CLOSED" || clarification.status === "CANCELLED") {
      throw conflict("This clarification request is already closed");
    }

    const now = new Date();
    const isLate =
      clarification.dueDate !== null && new Date(clarification.dueDate).getTime() < now.getTime();

    await db.transaction(async (tx) => {
      await tx.insert(schema.clarificationResponses).values({
        id: newId(),
        clarificationId: clarification.id,
        responseText: req.body.responseText,
        attachedDocumentIds: req.body.documentIds ?? [],
        respondedBy: req.principal!.userId,
        respondedAt: now,
        isLate,
      });

      await tx
        .update(schema.clarificationRequests)
        .set({
          status: "RESPONDED",
          respondedAt: now,
          responseText: req.body.responseText,
        })
        .where(eq(schema.clarificationRequests.id, clarification.id));

      await recordAudit(
        {
          action: "CLARIFICATION_RESPONDED",
          actorId: req.principal!.userId,
          actorName: req.principal!.fullName,
          actorRole: "CANDIDATE",
          entityType: "clarification_request",
          entityId: clarification.id,
          caseId: caseRow.id,
          newValue: { respondedAt: now.toISOString(), isLate, attachedDocumentIds: req.body.documentIds ?? [] },
          ipAddress: req.ipAddress ?? null,
          userAgent: req.userAgent ?? null,
          requestId: req.requestId,
        },
        tx,
      );
    });

    if (clarification.requestedBy) {
      await queueNotification({
        event: "CLARIFICATION_RESPONDED",
        recipientUserId: clarification.requestedBy,
        caseId: caseRow.id,
        deduplicationKey: `${clarification.id}-response-${now.getTime()}`,
        variables: {
          candidateName: req.principal!.fullName,
          caseNumber: caseRow.caseNumber,
        },
      });
    }

    res.status(200).json({ data: { id: clarification.id, status: "RESPONDED", isLate } });
  },
);

/**
 * POST /api/clarifications/:clarificationId/close
 *
 * Closes a clarification request. The reason is recorded; nothing is deleted.
 */
verificationRouter.post(
  "/clarifications/:clarificationId/close",
  requirePrincipal,
  requirePermission("clarification:close"),
  validate({ params: clarificationParams, body: clarificationClosureSchema }),
  async (req, res) => {
    const { db } = getDatabase();
    const [clarification] = await db
      .select()
      .from(schema.clarificationRequests)
      .where(eq(schema.clarificationRequests.id, param(req, "clarificationId")))
      .limit(1);
    if (!clarification) throw notFound("Clarification request not found");

    const { caseRow } = await resolveCase(req.principal!, clarification.caseId);
    if (clarification.status === "CLOSED") {
      throw conflict("This clarification request is already closed");
    }

    const now = new Date();

    await db.transaction(async (tx) => {
      await tx
        .update(schema.clarificationRequests)
        .set({
          status: "CLOSED",
          closedAt: now,
          closedBy: req.principal!.userId,
          closeReason: req.body.reason,
        })
        .where(eq(schema.clarificationRequests.id, clarification.id));

      if (clarification.checkId) {
        await tx
          .update(schema.verificationChecks)
          .set({ status: "UNDER_VERIFICATION", updatedAt: now })
          .where(eq(schema.verificationChecks.id, clarification.checkId));
      }
      if (clarification.documentId) {
        await tx
          .update(schema.documents)
          .set({ status: "UPLOADED", updatedAt: now })
          .where(eq(schema.documents.id, clarification.documentId));
      }

      await recordAudit(
        {
          action: "CLARIFICATION_CLOSED",
          actorId: req.principal!.userId,
          actorName: req.principal!.fullName,
          actorRole: req.principal!.roles[0] ?? null,
          entityType: "clarification_request",
          entityId: clarification.id,
          caseId: caseRow.id,
          previousValue: { status: clarification.status },
          newValue: { status: "CLOSED" },
          reason: req.body.reason,
          ipAddress: req.ipAddress ?? null,
          userAgent: req.userAgent ?? null,
          requestId: req.requestId,
        },
        tx,
      );
    });

    // When the last open clarification is closed, verification resumes.
    if (caseRow.status === "CLARIFICATION_REQUIRED") {
      const remaining = await db
        .select({ id: schema.clarificationRequests.id })
        .from(schema.clarificationRequests)
        .where(
          and(
            eq(schema.clarificationRequests.caseId, caseRow.id),
            inArray(schema.clarificationRequests.status, ["OPEN", "RESPONDED"]),
          ),
        );
      if (remaining.length === 0) {
        await db.transaction(async (tx) => {
          await transitionCase(tx, {
            caseId: caseRow.id,
            to: "VERIFICATION_IN_PROGRESS",
            actor: {
              userId: req.principal!.userId,
              fullName: req.principal!.fullName,
              role: req.principal!.roles[0] ?? null,
            },
            reason: "All clarification requests have been closed",
          });
        });
      }
    }

    res.status(200).json({ data: { id: clarification.id, status: "CLOSED" } });
  },
);

export { CANDIDATE_VISIBLE_STATUSES };

/**
 * Reads the first row of a raw query result.
 *
 * The MySQL driver returns the rows directly, but the shape differs between
 * result types, so both forms are handled.
 */
function readFirstNumber(result: unknown, key: string): number {
  const candidates = [
    result,
    (result as { rows?: unknown })?.rows,
    Array.isArray(result) ? result[0] : undefined,
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate) && candidate.length > 0) {
      const value = (candidate[0] as Record<string, unknown>)[key];
      if (value !== undefined) return Number(value);
    }
    if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
      const value = (candidate as Record<string, unknown>)[key];
      if (value !== undefined) return Number(value);
    }
  }
  return 0;
}
