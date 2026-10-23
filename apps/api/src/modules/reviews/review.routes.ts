import { Router } from "express";
import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { finalApprovalRequestSchema, recordReviewDecisionSchema } from "@checkiq/contracts";
import { getDatabase, schema } from "../../db/client.js";
import { param } from "../../lib/request.js";
import { requirePermission, requirePrincipal } from "../../middleware/authenticate.js";
import { validate } from "../../middleware/validate.js";
import { conflict, forbidden, preconditionFailed, validationError } from "../../lib/errors.js";
import { newId } from "../../lib/ids.js";
import { recordAudit } from "../../services/audit.service.js";
import { resolveCase } from "../../services/access.service.js";
import { transitionCase } from "../../services/case.service.js";
import { queueNotification } from "../../services/notification.service.js";
import { getBooleanConfig } from "../../services/config.service.js";

export const reviewRouter = Router();

const caseParams = z.object({ caseId: z.string().uuid() });

/**
 * GET /api/cases/:caseId/reviews
 */
reviewRouter.get(
  "/cases/:caseId/reviews",
  requirePrincipal,
  requirePermission("review:read"),
  validate({ params: caseParams }),
  async (req, res) => {
    const { caseRow } = await resolveCase(req.principal!, param(req, "caseId"));
    const { db } = getDatabase();
    const rows = await db
      .select({
        id: schema.reviews.id,
        round: schema.reviews.round,
        status: schema.reviews.status,
        reviewerId: schema.reviews.reviewerId,
        reviewerName: schema.users.fullName,
        reviewerRole: schema.reviews.reviewerRole,
        decision: schema.reviews.decision,
        remarks: schema.reviews.remarks,
        returnReason: schema.reviews.returnReason,
        isMakerCheckerSatisfied: schema.reviews.isMakerCheckerSatisfied,
        createdAt: schema.reviews.createdAt,
        decidedAt: schema.reviews.decidedAt,
      })
      .from(schema.reviews)
      .leftJoin(schema.users, eq(schema.users.id, schema.reviews.reviewerId))
      .where(eq(schema.reviews.caseId, caseRow.id))
      .orderBy(asc(schema.reviews.round));

    const approvals = await db
      .select({
        id: schema.approvals.id,
        approvedBy: schema.approvals.approvedBy,
        approvedByName: schema.users.fullName,
        approvedByRole: schema.approvals.approvedByRole,
        decision: schema.approvals.decision,
        remarks: schema.approvals.remarks,
        scoreAtApproval: schema.approvals.scoreAtApproval,
        createdAt: schema.approvals.createdAt,
      })
      .from(schema.approvals)
      .leftJoin(schema.users, eq(schema.users.id, schema.approvals.approvedBy))
      .where(eq(schema.approvals.caseId, caseRow.id))
      .orderBy(asc(schema.approvals.createdAt));

    res.status(200).json({
      data: {
        reviews: rows.map((row) => ({
          id: row.id,
          caseId: caseRow.id,
          round: row.round,
          status: row.status,
          reviewerId: row.reviewerId,
          reviewerName: row.reviewerName,
          reviewerRole: row.reviewerRole,
          decision: row.decision,
          remarks: row.remarks,
          returnReason: row.returnReason,
          isMakerCheckerSatisfied: row.isMakerCheckerSatisfied,
          createdAt: row.createdAt.toISOString(),
          decidedAt: row.decidedAt?.toISOString() ?? null,
        })),
        approvals: approvals.map((row) => ({
          id: row.id,
          caseId: caseRow.id,
          approvedBy: row.approvedBy,
          approvedByName: row.approvedByName,
          approvedByRole: row.approvedByRole,
          decision: row.decision as "APPROVED" | "REJECTED" | "ROUTED_FOR_REVIEW",
          remarks: row.remarks,
          createdAt: row.createdAt.toISOString(),
        })),
      },
    });
  },
);

/**
 * POST /api/cases/:caseId/review
 *
 * Records a maker-checker review decision. Returning the case for further work
 * requires a reason; the original finding and review history are preserved.
 */
reviewRouter.post(
  "/cases/:caseId/review",
  requirePrincipal,
  requirePermission("review:decide"),
  validate({ params: caseParams, body: recordReviewDecisionSchema }),
  async (req, res) => {
    const { caseRow } = await resolveCase(req.principal!, param(req, "caseId"));
    const { db } = getDatabase();

    if (req.body.decision === "RETURN_FOR_WORK" && !req.body.returnReason) {
      throw validationError("A reason is required when returning a case for further work");
    }

    const [pkg] = await db
      .select({ requiresMakerChecker: schema.bgvPackages.requiresMakerChecker })
      .from(schema.bgvPackages)
      .where(eq(schema.bgvPackages.id, caseRow.packageId))
      .limit(1);

    const allowSelfReview = await getBooleanConfig("review.allow_self_review", false);
    const maker = await findMaker(caseRow.id);
    const isSelfReview = maker !== null && maker === req.principal!.userId;

    if (pkg?.requiresMakerChecker && !allowSelfReview && isSelfReview) {
      throw forbidden(
        "You recorded the verification result for this case and cannot also review it. The review must be completed by a different person.",
      );
    }

    const [roundRow] = await db
      .select({ round: schema.reviews.round })
      .from(schema.reviews)
      .where(eq(schema.reviews.caseId, caseRow.id))
      .orderBy(desc(schema.reviews.round))
      .limit(1);
    const round = (roundRow?.round ?? 0) + 1;
    const reviewId = newId();
    const now = new Date();

    await db.transaction(async (tx) => {
      await tx.insert(schema.reviews).values({
        id: reviewId,
        caseId: caseRow.id,
        round,
        status:
          req.body.decision === "APPROVE"
            ? "APPROVED"
            : req.body.decision === "REJECT"
              ? "REJECTED"
              : "RETURNED_FOR_WORK",
        reviewerId: req.principal!.userId,
        reviewerRole: req.principal!.roles[0] ?? null,
        decision: req.body.decision,
        remarks: req.body.remarks ?? null,
        returnReason: req.body.returnReason ?? null,
        isMakerCheckerSatisfied: !(pkg?.requiresMakerChecker && isSelfReview),
        decidedAt: now,
      });

      await recordAudit(
        {
          action: "REVIEW_RECORDED",
          actorId: req.principal!.userId,
          actorName: req.principal!.fullName,
          actorRole: req.principal!.roles[0] ?? null,
          entityType: "review",
          entityId: reviewId,
          caseId: caseRow.id,
          newValue: { decision: req.body.decision, round },
          reason: req.body.returnReason ?? req.body.remarks ?? null,
          ipAddress: req.ipAddress ?? null,
          userAgent: req.userAgent ?? null,
          requestId: req.requestId,
        },
        tx,
      );

      if (req.body.decision === "RETURN_FOR_WORK") {
        await transitionCase(tx, {
          caseId: caseRow.id,
          to: "VERIFICATION_IN_PROGRESS",
          actor: {
            userId: req.principal!.userId,
            fullName: req.principal!.fullName,
            role: req.principal!.roles[0] ?? null,
          },
          reason: req.body.returnReason ?? "Returned for further work",
        });
      }
    });

    res.status(201).json({ data: { id: reviewId, round, decision: req.body.decision } });
  },
);

/**
 * POST /api/cases/:caseId/approval
 *
 * Records the final approval decision and moves the case accordingly.
 */
reviewRouter.post(
  "/cases/:caseId/approval",
  requirePrincipal,
  requirePermission("approval:decide"),
  validate({ params: caseParams, body: finalApprovalRequestSchema }),
  async (req, res) => {
    const { caseRow } = await resolveCase(req.principal!, param(req, "caseId"));
    const { db } = getDatabase();

    if (req.body.decision === "APPROVED") {
      const openClarifications = await db
        .select({ id: schema.clarificationRequests.id })
        .from(schema.clarificationRequests)
        .where(
          and(
            eq(schema.clarificationRequests.caseId, caseRow.id),
            eq(schema.clarificationRequests.status, "OPEN"),
          ),
        );
      if (openClarifications.length > 0) {
        throw preconditionFailed(
          "This case cannot be approved while a clarification request is still open.",
          { openClarifications: openClarifications.length },
        );
      }

      const [pkg] = await db
        .select({ requiresMakerChecker: schema.bgvPackages.requiresMakerChecker })
        .from(schema.bgvPackages)
        .where(eq(schema.bgvPackages.id, caseRow.packageId))
        .limit(1);
      const allowSelfReview = await getBooleanConfig("review.allow_self_review", false);
      const maker = await findMaker(caseRow.id);
      if (pkg?.requiresMakerChecker && !allowSelfReview && maker === req.principal!.userId) {
        throw forbidden(
          "You verified this case and cannot also approve it. The approval must be completed by a different person.",
        );
      }
    }

    const approvalId = newId();
    const now = new Date();

    await db.transaction(async (tx) => {
      await tx.insert(schema.approvals).values({
        id: approvalId,
        caseId: caseRow.id,
        approvedBy: req.principal!.userId,
        approvedByRole: req.principal!.roles[0] ?? null,
        decision: req.body.decision,
        remarks: req.body.remarks ?? null,
        scoreAtApproval: caseRow.score === null ? null : String(caseRow.score),
        createdAt: now,
      });

      await recordAudit(
        {
          action: "APPROVAL_RECORDED",
          actorId: req.principal!.userId,
          actorName: req.principal!.fullName,
          actorRole: req.principal!.roles[0] ?? null,
          entityType: "approval",
          entityId: approvalId,
          caseId: caseRow.id,
          newValue: { decision: req.body.decision },
          reason: req.body.remarks ?? null,
          ipAddress: req.ipAddress ?? null,
          userAgent: req.userAgent ?? null,
          requestId: req.requestId,
        },
        tx,
      );

      if (req.body.decision === "APPROVED") {
        await transitionCase(tx, {
          caseId: caseRow.id,
          to: "BGV_APPROVED",
          actor: {
            userId: req.principal!.userId,
            fullName: req.principal!.fullName,
            role: req.principal!.roles[0] ?? null,
          },
          reason: req.body.remarks ?? "Approved",
        });
      } else if (req.body.decision === "ROUTED_FOR_REVIEW") {
        await transitionCase(tx, {
          caseId: caseRow.id,
          to: "BGV_REVIEW_REQUIRED",
          actor: {
            userId: req.principal!.userId,
            fullName: req.principal!.fullName,
            role: req.principal!.roles[0] ?? null,
          },
          reason: req.body.remarks ?? "Routed for further review",
        });
      }
    });

    if (req.body.decision === "APPROVED") {
      await queueNotification({
        event: "BGV_OUTCOME",
        recipientUserId: (await candidateUserId(caseRow.profileId)) ?? "",
        caseId: caseRow.id,
        deduplicationKey: `approval-${approvalId}`,
        variables: {
          candidateName: "",
          caseNumber: caseRow.caseNumber,
        },
      });
    }

    res.status(201).json({ data: { id: approvalId, decision: req.body.decision } });
  },
);

/** The user who recorded the most recent verification result for a case. */
async function findMaker(caseId: string): Promise<string | null> {
  const { db } = getDatabase();
  const [row] = await db
    .select({ recordedBy: schema.verificationCheckResults.recordedBy })
    .from(schema.verificationCheckResults)
    .innerJoin(
      schema.verificationChecks,
      eq(schema.verificationChecks.id, schema.verificationCheckResults.checkId),
    )
    .where(
      and(
        eq(schema.verificationChecks.caseId, caseId),
        eq(schema.verificationCheckResults.isCurrent, true),
      ),
    )
    .orderBy(desc(schema.verificationCheckResults.recordedAt))
    .limit(1);
  return row?.recordedBy ?? null;
}

async function candidateUserId(profileId: string): Promise<string | null> {
  const { db } = getDatabase();
  const [row] = await db
    .select({ userId: schema.candidateProfiles.userId })
    .from(schema.candidateProfiles)
    .where(eq(schema.candidateProfiles.id, profileId))
    .limit(1);
  return row?.userId ?? null;
}

export { conflict };
