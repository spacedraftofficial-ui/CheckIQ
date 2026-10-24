import { Router } from "express";
import { and, asc, count, desc, eq, gte, inArray, like, lte, or, type SQL } from "drizzle-orm";
import { z } from "zod";
import { caseFiltersSchema, submitCaseRequestSchema } from "@checkiq/contracts";
import { getDatabase, schema } from "../../db/client.js";
import { param } from "../../lib/request.js";
import { requirePermission, requirePrincipal } from "../../middleware/authenticate.js";
import { validate } from "../../middleware/validate.js";
import { conflict, forbidden, validationError } from "../../lib/errors.js";
import { newId } from "../../lib/ids.js";
import { recordAudit } from "../../services/audit.service.js";
import { affectedRows, createCaseForProfile, resolveDefaultPackageId } from "../../services/case.service.js";
import { caseScopePredicate, resolveCase } from "../../services/access.service.js";
import { evaluateReadiness } from "../../services/readiness.service.js";
import { queueNotification } from "../../services/notification.service.js";
import { submitCase } from "./submission.service.js";
import { CANDIDATE_VISIBLE_STATUSES } from "./case-state.js";

export const casesRouter = Router();

async function countRequiredProfileFields(packageId: string): Promise<number> {
  const { db } = getDatabase();
  const rows = await db
    .select({ fieldKey: schema.bgvPackageProfileFields.fieldKey })
    .from(schema.bgvPackageProfileFields)
    .where(eq(schema.bgvPackageProfileFields.packageId, packageId));
  return rows.length;
}

async function countRequiredDocuments(packageId: string): Promise<number> {
  const { db } = getDatabase();
  const rows = await db
    .select({ id: schema.documentRequirements.id })
    .from(schema.documentRequirements)
    .where(
      and(
        eq(schema.documentRequirements.packageId, packageId),
        eq(schema.documentRequirements.isMandatory, true),
      ),
    );
  return rows.length;
}

const caseParams = z.object({ caseId: z.string().uuid() });
const assignBody = z.object({
  verifierId: z.string().uuid().optional(),
  reviewerId: z.string().uuid().optional(),
  reason: z.string().trim().max(1000).optional(),
  /** Optimistic concurrency token. The update fails when the case has changed. */
  expectedVersion: z.number().int().positive().optional(),
});

const createCaseBody = z.object({
  candidateId: z.string().trim().min(1).max(64),
  packageId: z.string().uuid().optional(),
  company: z.string().trim().max(160).optional(),
  department: z.string().trim().max(160).optional(),
  position: z.string().trim().max(160).optional(),
});

/**
 * GET /api/cases
 *
 * Permission-aware case search. The scope predicate is applied in SQL so that
 * the row count and the returned rows can never disagree, and a user without
 * access never sees a record they are not entitled to.
 */
casesRouter.get(
  "/cases",
  requirePrincipal,
  requirePermission("case:list:queue", "case:read:own", "case:read:any"),
  validate({ query: caseFiltersSchema }),
  async (req, res) => {
    const { db } = getDatabase();
    const filters = req.query as unknown as z.infer<typeof caseFiltersSchema>;

    const conditions: SQL[] = [];
    const scope = caseScopePredicate(req.principal!);
    if (scope) conditions.push(scope);

    if (filters.status && filters.status.length > 0) {
      conditions.push(inArray(schema.bgvCases.status, filters.status));
    }
    if (filters.assignedVerifierId) {
      conditions.push(eq(schema.bgvCases.assignedVerifierId, filters.assignedVerifierId));
    }
    if (filters.company) conditions.push(eq(schema.bgvCases.company, filters.company));
    if (filters.department) conditions.push(eq(schema.bgvCases.department, filters.department));
    if (filters.position) conditions.push(eq(schema.bgvCases.position, filters.position));
    if (filters.submittedFrom) {
      conditions.push(gte(schema.bgvCases.submittedAt, new Date(filters.submittedFrom)));
    }
    if (filters.submittedTo) {
      const to = new Date(filters.submittedTo);
      to.setUTCHours(23, 59, 59, 999);
      conditions.push(lte(schema.bgvCases.submittedAt, to));
    }
    if (filters.candidateId) {
      conditions.push(
        eq(schema.candidateProfiles.candidateId, filters.candidateId),
      );
    }
    if (filters.search) {
      const term = `%${filters.search}%`;
      const searchClause = or(
        eq(schema.candidateProfiles.candidateId, filters.search),
        like(schema.candidateProfiles.fullName, term),
        like(schema.bgvCases.caseNumber, term),
      );
      if (searchClause) conditions.push(searchClause);
    }
    if (filters.scoreMin !== undefined || filters.scoreMax !== undefined) {
      const scoreConditions: SQL[] = [];
      if (filters.scoreMin !== undefined) scoreConditions.push(gte(schema.bgvCases.score, String(filters.scoreMin)));
      if (filters.scoreMax !== undefined) scoreConditions.push(lte(schema.bgvCases.score, String(filters.scoreMax)));
      conditions.push(and(...scoreConditions)!);
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const totalRows = await db
      .select({ value: count() })
      .from(schema.bgvCases)
      .innerJoin(
        schema.candidateProfiles,
        eq(schema.candidateProfiles.id, schema.bgvCases.profileId),
      )
      .where(where);

    const rows = await db
      .select({
        id: schema.bgvCases.id,
        caseNumber: schema.bgvCases.caseNumber,
        candidateId: schema.candidateProfiles.candidateId,
        candidateName: schema.candidateProfiles.fullName,
        company: schema.bgvCases.company,
        department: schema.bgvCases.department,
        position: schema.bgvCases.position,
        status: schema.bgvCases.status,
        assignedVerifierId: schema.bgvCases.assignedVerifierId,
        assignedVerifierName: schema.users.fullName,
        score: schema.bgvCases.score,
        scoreOutcome: schema.bgvCases.scoreOutcome,
        submittedAt: schema.bgvCases.submittedAt,
        updatedAt: schema.bgvCases.updatedAt,
      })
      .from(schema.bgvCases)
      .innerJoin(
        schema.candidateProfiles,
        eq(schema.candidateProfiles.id, schema.bgvCases.profileId),
      )
      .leftJoin(schema.users, eq(schema.users.id, schema.bgvCases.assignedVerifierId))
      .where(where)
      .orderBy(desc(schema.bgvCases.updatedAt))
      .limit(filters.pageSize)
      .offset((filters.page - 1) * filters.pageSize);

    const total = totalRows[0]?.value ?? 0;
    res.status(200).json({
      data: rows.map((row) => ({
        id: row.id,
        caseNumber: row.caseNumber,
        candidateId: row.candidateId,
        candidateName: row.candidateName,
        company: row.company,
        department: row.department,
        position: row.position,
        status: row.status,
        assignedVerifierId: row.assignedVerifierId,
        assignedVerifierName: row.assignedVerifierName,
        score: row.score === null ? null : Number(row.score),
        scoreOutcome: row.scoreOutcome,
        submittedAt: row.submittedAt?.toISOString() ?? null,
        updatedAt: row.updatedAt.toISOString(),
        openClarificationCount: 0,
      })),
      meta: {
        page: filters.page,
        pageSize: filters.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / filters.pageSize)),
      },
    });
  },
);

/**
 * POST /api/cases
 *
 * Opens a background verification case for a candidate who has already
 * registered. The candidate must exist first: a case belongs to a candidate
 * profile, and a profile belongs to an account.
 */
casesRouter.post(
  "/cases",
  requirePrincipal,
  requirePermission("case:create"),
  validate({ body: createCaseBody }),
  async (req, res) => {
    const { db } = getDatabase();
    const candidateId = req.body.candidateId;

    const [profile] = await db
      .select()
      .from(schema.candidateProfiles)
      .where(eq(schema.candidateProfiles.candidateId, candidateId))
      .limit(1);

    if (!profile) {
      throw validationError(
        "No candidate is registered with that Candidate ID. The candidate must create their account before a case can be opened.",
      );
    }

    // Resolve the package first: a candidate may hold one open case per
    // package, so a second role can be verified without closing the first.
    const packageId = req.body.packageId ?? (await resolveDefaultPackageId(db));
    const [pkg] = await db
      .select({ id: schema.bgvPackages.id, name: schema.bgvPackages.name })
      .from(schema.bgvPackages)
      .where(eq(schema.bgvPackages.id, packageId))
      .limit(1);
    if (!pkg) throw validationError("The requested BGV package does not exist.");

    const [existing] = await db
      .select({ id: schema.bgvCases.id, caseNumber: schema.bgvCases.caseNumber })
      .from(schema.bgvCases)
      .where(
        and(
          eq(schema.bgvCases.profileId, profile.id),
          eq(schema.bgvCases.packageId, packageId),
          inArray(schema.bgvCases.status, [
            "DRAFT",
            "DOCUMENT_UPLOAD_IN_PROGRESS",
            "SUBMITTED",
            "VERIFICATION_IN_PROGRESS",
            "CLARIFICATION_REQUIRED",
            "VERIFICATION_COMPLETED",
            "BGV_SCORE_GENERATED",
            "BGV_REVIEW_REQUIRED",
          ]),
        ),
      )
      .limit(1);

    if (existing) {
      throw conflict(
        "This candidate already has an open background verification case for this package.",
        { caseNumber: existing.caseNumber, packageId },
      );
    }

    const caseId = await db.transaction(async (tx) =>
      createCaseForProfile(tx, {
        profileId: profile.id,
        packageId,
        company: req.body.company ?? null,
        department: req.body.department ?? null,
        position: req.body.position ?? null,
      }),
    );

    const [created] = await db
      .select()
      .from(schema.bgvCases)
      .where(eq(schema.bgvCases.id, caseId))
      .limit(1);

    await recordAudit({
      action: "CASE_CREATED",
      actorId: req.principal!.userId,
      actorName: req.principal!.fullName,
      actorRole: req.principal!.roles[0] ?? null,
      entityType: "bgv_case",
      entityId: caseId,
      caseId,
      candidateId,
      newValue: { status: "DOCUMENT_UPLOAD_IN_PROGRESS", caseNumber: created?.caseNumber },
      ipAddress: req.ipAddress ?? null,
      userAgent: req.userAgent ?? null,
      requestId: req.requestId,
    });

    const requirements = await db
      .select({ id: schema.documentRequirements.id })
      .from(schema.documentRequirements)
      .where(
        req.body.packageId
          ? eq(schema.documentRequirements.packageId, req.body.packageId)
          : eq(schema.documentRequirements.packageId, created?.packageId ?? ""),
      );

    await queueNotification({
      event: "DOCUMENTS_REQUIRED",
      recipientUserId: profile.userId,
      recipientEmail: profile.email,
      caseId,
      deduplicationKey: `documents-required-${caseId}`,
      variables: {
        candidateName: profile.fullName,
        candidateId,
        caseNumber: created?.caseNumber ?? "",
        documentCount: requirements.length,
      },
    });

    res.status(201).json({
      data: {
        id: caseId,
        caseNumber: created?.caseNumber,
        candidateId,
        status: created?.status,
        packageId: created?.packageId,
      },
    });
  },
);

/**
 * GET /api/cases/queue-counts
 */
casesRouter.get(
  "/cases/queue-counts",
  requirePrincipal,
  requirePermission("case:list:queue"),
  async (req, res) => {
    const { db } = getDatabase();
    const scope = caseScopePredicate(req.principal!);
    const rows = await db
      .select({ status: schema.bgvCases.status, value: count() })
      .from(schema.bgvCases)
      .where(scope)
      .groupBy(schema.bgvCases.status);

    const byStatus: Record<string, number> = {};
    let total = 0;
    for (const row of rows) {
      byStatus[row.status] = row.value;
      total += row.value;
    }

    const clarificationRows = await db
      .select({ value: count() })
      .from(schema.clarificationRequests)
      .innerJoin(schema.bgvCases, eq(schema.bgvCases.id, schema.clarificationRequests.caseId))
      .where(
        scope
          ? and(scope, inArray(schema.clarificationRequests.status, ["OPEN", "RESPONDED"]))
          : inArray(schema.clarificationRequests.status, ["OPEN", "RESPONDED"]),
      );

    res.status(200).json({
      data: {
        total,
        byStatus,
        awaitingClarification: clarificationRows[0]?.value ?? 0,
        belowThreshold: byStatus["BELOW_BGV_ELIGIBILITY_THRESHOLD"] ?? 0,
      },
    });
  },
);

/**
 * GET /api/cases/:caseId
 */
casesRouter.get(
  "/cases/:caseId",
  requirePrincipal,
  validate({ params: caseParams }),
  async (req, res) => {
    const { caseRow, profile } = await resolveCase(req.principal!, param(req, "caseId"));
    const { db } = getDatabase();

    const [verifier, reviewer, pkg] = await Promise.all([
      caseRow.assignedVerifierId
        ? db
            .select({ fullName: schema.users.fullName })
            .from(schema.users)
            .where(eq(schema.users.id, caseRow.assignedVerifierId))
            .limit(1)
        : Promise.resolve([]),
      caseRow.assignedReviewerId
        ? db
            .select({ fullName: schema.users.fullName })
            .from(schema.users)
            .where(eq(schema.users.id, caseRow.assignedReviewerId))
            .limit(1)
        : Promise.resolve([]),
      db
        .select({ name: schema.bgvPackages.name })
        .from(schema.bgvPackages)
        .where(eq(schema.bgvPackages.id, caseRow.packageId))
        .limit(1),
    ]);

    const isCandidate = req.principal!.candidateProfileId === profile.id;
    const canSeeScore =
      !isCandidate ||
      req.principal!.permissions.has("score:read" as never) ||
      req.principal!.permissions.has("case:read:any" as never);

    const readiness = await evaluateReadiness(caseRow.id);

    const totalProfileFields = await countRequiredProfileFields(caseRow.packageId);
    const totalDocuments = await countRequiredDocuments(caseRow.packageId);

    res.status(200).json({
      data: {
        id: caseRow.id,
        caseNumber: caseRow.caseNumber,
        candidateId: profile.candidateId,
        candidateName: profile.fullName,
        candidateEmail: profile.email,
        company: caseRow.company,
        department: caseRow.department,
        position: caseRow.position,
        packageId: caseRow.packageId,
        packageName: pkg[0]?.name ?? "",
        status: caseRow.status,
        statusLabel: isCandidate
          ? (CANDIDATE_VISIBLE_STATUSES[caseRow.status as keyof typeof CANDIDATE_VISIBLE_STATUSES] ??
            caseRow.status)
          : caseRow.status,
        assignedVerifierId: caseRow.assignedVerifierId,
        assignedVerifierName: verifier[0]?.fullName ?? null,
        assignedReviewerId: caseRow.assignedReviewerId,
        assignedReviewerName: reviewer[0]?.fullName ?? null,
        submittedAt: caseRow.submittedAt?.toISOString() ?? null,
        verificationStartedAt: caseRow.verificationStartedAt?.toISOString() ?? null,
        verificationCompletedAt: caseRow.verificationCompletedAt?.toISOString() ?? null,
        score: canSeeScore && caseRow.score !== null ? Number(caseRow.score) : null,
        scoreOutcome: canSeeScore ? caseRow.scoreOutcome : null,
        eligibilityResult: canSeeScore ? caseRow.eligibilityResult : null,
        openClarificationCount: readiness.missing.openClarifications.length,
        profileCompletion: {
          completed: totalProfileFields - readiness.missing.profileFields.length,
          total: totalProfileFields,
          percentage: totalProfileFields > 0
            ? Math.round(((totalProfileFields - readiness.missing.profileFields.length) / totalProfileFields) * 100)
            : 0,
        },
        documentCompletion: {
          completed: totalDocuments - readiness.missing.documents.length,
          total: totalDocuments,
          percentage: totalDocuments > 0
            ? Math.round(((totalDocuments - readiness.missing.documents.length) / totalDocuments) * 100)
            : 0,
        },
        submissionReady: readiness.ready,
        createdAt: caseRow.createdAt.toISOString(),
        updatedAt: caseRow.updatedAt.toISOString(),
        version: caseRow.version,
      },
    });
  },
);

/**
 * GET /api/cases/:caseId/history
 */
casesRouter.get(
  "/cases/:caseId/history",
  requirePrincipal,
  validate({ params: caseParams }),
  async (req, res) => {
    const { caseRow } = await resolveCase(req.principal!, param(req, "caseId"));
    const { db } = getDatabase();
    const rows = await db
      .select({
        id: schema.caseStatusHistory.id,
        fromStatus: schema.caseStatusHistory.fromStatus,
        toStatus: schema.caseStatusHistory.toStatus,
        actorId: schema.caseStatusHistory.actorId,
        actorName: schema.users.fullName,
        actorRole: schema.caseStatusHistory.actorRole,
        reason: schema.caseStatusHistory.reason,
        createdAt: schema.caseStatusHistory.createdAt,
      })
      .from(schema.caseStatusHistory)
      .leftJoin(schema.users, eq(schema.users.id, schema.caseStatusHistory.actorId))
      .where(eq(schema.caseStatusHistory.caseId, caseRow.id))
      .orderBy(asc(schema.caseStatusHistory.createdAt));

    res.status(200).json({
      data: rows.map((row) => ({
        id: row.id,
        fromStatus: row.fromStatus,
        toStatus: row.toStatus,
        actorId: row.actorId,
        actorName: row.actorName,
        actorRole: row.actorRole,
        reason: row.reason,
        createdAt: row.createdAt.toISOString(),
      })),
    });
  },
);

/**
 * GET /api/cases/:caseId/readiness
 */
casesRouter.get(
  "/cases/:caseId/readiness",
  requirePrincipal,
  validate({ params: caseParams }),
  async (req, res) => {
    const { caseRow } = await resolveCase(req.principal!, param(req, "caseId"));
    const readiness = await evaluateReadiness(caseRow.id);
    res.status(200).json({ data: readiness });
  },
);

/**
 * POST /api/cases/:caseId/submit
 *
 * Idempotent submission.
 */
casesRouter.post(
  "/cases/:caseId/submit",
  requirePrincipal,
  validate({ params: caseParams, body: submitCaseRequestSchema }),
  async (req, res) => {
    const { caseRow } = await resolveCase(req.principal!, param(req, "caseId"));
    if (req.principal!.candidateProfileId !== caseRow.profileId) {
      throw forbidden("Only the candidate can submit this case");
    }
    const result = await submitCase(caseRow.id, req.body.idempotencyKey, req.principal!);
    res.status(result.alreadySubmitted ? 200 : 201).json({ data: result });
  },
);

/**
 * POST /api/cases/:caseId/assign
 */
casesRouter.post(
  "/cases/:caseId/assign",
  requirePrincipal,
  requirePermission("case:assign"),
  validate({ params: caseParams, body: assignBody }),
  async (req, res) => {
    const { caseRow } = await resolveCase(req.principal!, param(req, "caseId"));
    const { db } = getDatabase();

    if (
      req.body.expectedVersion !== undefined &&
      req.body.expectedVersion !== caseRow.version
    ) {
      throw conflict("This case was updated by someone else. Reload and try again.", {
        currentVersion: caseRow.version,
        currentStatus: caseRow.status,
      });
    }

    const patch: Partial<typeof schema.bgvCases.$inferInsert> = { updatedAt: new Date() };
    if (req.body.verifierId) patch.assignedVerifierId = req.body.verifierId;
    if (req.body.reviewerId) patch.assignedReviewerId = req.body.reviewerId;

    if (req.body.verifierId) {
      const [verifier] = await db
        .select({ id: schema.users.id, fullName: schema.users.fullName })
        .from(schema.users)
        .where(eq(schema.users.id, req.body.verifierId))
        .limit(1);
      if (!verifier) throw validationError("The selected verifier does not exist");
    }
    if (req.body.reviewerId) {
      const [reviewer] = await db
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.id, req.body.reviewerId))
        .limit(1);
      if (!reviewer) throw validationError("The selected reviewer does not exist");
    }

    await db.transaction(async (tx) => {
      const updated = await tx
        .update(schema.bgvCases)
        .set({ ...patch, version: caseRow.version + 1 })
        .where(
          and(
            eq(schema.bgvCases.id, caseRow.id),
            eq(schema.bgvCases.version, caseRow.version),
          ),
        );

      const affected = affectedRows(updated);
      if (affected === 0) {
        throw conflict("This case was updated by someone else. Reload and try again.", {
          currentVersion: caseRow.version,
        });
      }

      await tx.insert(schema.caseAssignments).values({
        id: newId(),
        caseId: caseRow.id,
        userId: req.body.verifierId ?? req.body.reviewerId!,
        assignmentRole: req.body.verifierId ? "VERIFIER" : "REVIEWER",
        assignedBy: req.principal!.userId,
        reason: req.body.reason ?? null,
      });

      await recordAudit(
        {
          action: "CASE_ASSIGNED",
          actorId: req.principal!.userId,
          actorName: req.principal!.fullName,
          actorRole: req.principal!.roles[0] ?? null,
          entityType: "bgv_case",
          entityId: caseRow.id,
          caseId: caseRow.id,
          previousValue: {
            assignedVerifierId: caseRow.assignedVerifierId,
            assignedReviewerId: caseRow.assignedReviewerId,
          },
          newValue: {
            assignedVerifierId: patch.assignedVerifierId ?? caseRow.assignedVerifierId,
            assignedReviewerId: patch.assignedReviewerId ?? caseRow.assignedReviewerId,
          },
          reason: req.body.reason ?? null,
          ipAddress: req.ipAddress ?? null,
          userAgent: req.userAgent ?? null,
          requestId: req.requestId,
        },
        tx,
      );
    });

    if (req.body.verifierId) {
      await queueNotification({
        event: "CASE_ASSIGNED",
        recipientUserId: req.body.verifierId,
        caseId: caseRow.id,
        deduplicationKey: `assign-${caseRow.id}-${req.body.verifierId}`,
        variables: { caseNumber: caseRow.caseNumber, candidateName: "" },
      });
    }

    res.status(200).json({ data: { assigned: true } });
  },
);
