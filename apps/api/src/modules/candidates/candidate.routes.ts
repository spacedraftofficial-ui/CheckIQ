import { Router, type NextFunction, type Request, type Response } from "express";
import { and, asc, eq } from "drizzle-orm";
import {
  acceptConsentSchema,
  updateProfileSchema,
} from "@checkiq/contracts";
import { getDatabase, schema } from "../../db/client.js";
import { requirePermission } from "../../middleware/authenticate.js";
import { validate } from "../../middleware/validate.js";
import { forbidden, notFound } from "../../lib/errors.js";
import { newId } from "../../lib/ids.js";
import { recordAudit } from "../../services/audit.service.js";
import { findCandidateCase } from "../../services/access.service.js";
import { evaluateReadiness } from "../../services/readiness.service.js";
import { notifyCandidate, queueNotification } from "../../services/notification.service.js";
import { CANDIDATE_VISIBLE_STATUSES } from "../cases/case-state.js";
import {
  collectMissingProfileFields,
  getCandidateProfile,
  recomputeProfileCompletion,
  updateCandidateProfile,
} from "./profile.service.js";

export const candidateRouter = Router();

/**
 * GET /api/profile/fields
 *
 * The configurable profile field definitions the candidate must complete.
 */
candidateRouter.get("/profile/fields", authenticateCandidate, async (_req, res) => {
  const { db } = getDatabase();
  const definitions = await db
    .select()
    .from(schema.profileFieldDefinitions)
    .where(eq(schema.profileFieldDefinitions.isActive, true))
    .orderBy(asc(schema.profileFieldDefinitions.displayOrder));
  res.status(200).json({
    data: definitions.map((definition) => ({
      key: definition.fieldKey,
      label: definition.label,
      section: definition.section,
      dataType: definition.dataType,
      required: definition.isRequired,
      options: definition.options ?? undefined,
      displayOrder: definition.displayOrder,
      appliesTo: definition.appliesTo ?? ["CANDIDATE"],
    })),
  });
});

/**
 * GET /api/profile
 */
candidateRouter.get("/profile", authenticateCandidate, async (req, res) => {
  const profile = await getCandidateProfile(req.principal!.candidateProfileId!, {
    isOwner: true,
    canReadSensitive: true,
  });
  res.status(200).json({ data: profile });
});

/**
 * PUT /api/profile
 */
candidateRouter.put(
  "/profile",
  authenticateCandidate,
  requirePermission("profile:write:own"),
  validate({ body: updateProfileSchema }),
  async (req, res) => {
    const profileId = req.principal!.candidateProfileId!;
    const profile = await updateCandidateProfile(profileId, req.body, {
      userId: req.principal!.userId,
      fullName: req.principal!.fullName,
      role: "CANDIDATE",
    });

    const { db } = getDatabase();
    const [caseRow] = await db
      .select({
        id: schema.bgvCases.id,
        packageId: schema.bgvCases.packageId,
        caseNumber: schema.bgvCases.caseNumber,
      })
      .from(schema.bgvCases)
      .where(eq(schema.bgvCases.profileId, profileId))
      .limit(1);
    if (caseRow) {
      const completed = await recomputeProfileCompletion(profileId, caseRow.packageId);
      if (completed) {
        await queueNotification({
          event: "PROFILE_COMPLETED",
          recipientUserId: req.principal!.userId,
          recipientEmail: req.principal!.email,
          variables: { candidateName: req.principal!.fullName },
        });

        // Tell the candidate what is still outstanding.
        const outstanding = await db
          .select({ id: schema.documents.id })
          .from(schema.documents)
          .innerJoin(
            schema.documentRequirements,
            eq(schema.documentRequirements.id, schema.documents.requirementId),
          )
          .where(
            and(
              eq(schema.documents.caseId, caseRow.id),
              eq(schema.documentRequirements.isMandatory, true),
              eq(schema.documents.status, "MISSING"),
            ),
          );

        if (outstanding.length > 0) {
          await notifyCandidate(
            profileId,
            "DOCUMENTS_REQUIRED",
            { caseNumber: caseRow.caseNumber, documentCount: outstanding.length },
            { caseId: caseRow.id, deduplicationKey: `documents-required-${caseRow.id}` },
          );
        }
      }
    }

    res.status(200).json({ data: profile });
  },
);

/**
 * GET /api/consent/current
 *
 * The active declaration/consent wording the candidate must accept.
 */
candidateRouter.get("/consent/current", authenticateCandidate, async (req, res) => {
  const { db } = getDatabase();
  const [active] = await db
    .select()
    .from(schema.consentVersions)
    .where(eq(schema.consentVersions.isActive, true))
    .orderBy(asc(schema.consentVersions.effectiveFrom))
    .limit(1);
  if (!active) {
    throw notFound("No active consent version is configured");
  }

  const [acceptance] = await db
    .select({ id: schema.consentAcceptances.id, acceptedAt: schema.consentAcceptances.acceptedAt })
    .from(schema.consentAcceptances)
    .where(
      and(
        eq(schema.consentAcceptances.profileId, req.principal!.candidateProfileId!),
        eq(schema.consentAcceptances.consentVersionId, active.id),
      ),
    )
    .limit(1);

  res.status(200).json({
    data: {
      id: active.id,
      version: active.version,
      title: active.title,
      body: active.body,
      effectiveFrom: active.effectiveFrom.toISOString(),
      isActive: active.isActive,
      accepted: Boolean(acceptance),
      acceptedAt: acceptance?.acceptedAt?.toISOString() ?? null,
    },
  });
});

/**
 * POST /api/consent/accept
 */
candidateRouter.post(
  "/consent/accept",
  authenticateCandidate,
  validate({ body: acceptConsentSchema }),
  async (req, res) => {
    const { db } = getDatabase();
    const [version] = await db
      .select()
      .from(schema.consentVersions)
      .where(eq(schema.consentVersions.id, req.body.consentVersionId))
      .limit(1);
    if (!version) throw notFound("Consent version not found");

    const [existing] = await db
      .select({ id: schema.consentAcceptances.id })
      .from(schema.consentAcceptances)
      .where(
        and(
          eq(schema.consentAcceptances.profileId, req.principal!.candidateProfileId!),
          eq(schema.consentAcceptances.consentVersionId, version.id),
        ),
      )
      .limit(1);

    if (!existing) {
      await db.transaction(async (tx) => {
        await tx.insert(schema.consentAcceptances).values({
          id: newId(),
          consentVersionId: version.id,
          version: version.version,
          userId: req.principal!.userId,
          profileId: req.principal!.candidateProfileId!,
          candidateId: req.principal!.candidateId!,
          ipAddress: req.ipAddress ?? null,
          userAgent: req.userAgent ?? null,
        });
        await recordAudit(
          {
            action: "CONSENT_ACCEPTED",
            actorId: req.principal!.userId,
            actorName: req.principal!.fullName,
            actorRole: "CANDIDATE",
            entityType: "consent_version",
            entityId: version.id,
            candidateId: req.principal!.candidateId,
            newValue: { version: version.version },
            ipAddress: req.ipAddress ?? null,
            userAgent: req.userAgent ?? null,
            requestId: req.requestId,
          },
          tx,
        );
      });
    }

    res.status(200).json({ data: { accepted: true, version: version.version } });
  },
);

/**
 * GET /api/dashboard
 *
 * The candidate's view of what to do next, what has been received and whether
 * action is required. Internal notes, verification sources and scores are not
 * disclosed here.
 */
candidateRouter.get("/dashboard", authenticateCandidate, async (req, res) => {
  const found = await findCandidateCase(req.principal!);
  if (!found) throw notFound("No background verification case is associated with this account");
  const { caseRow, profile } = found;

  const { db } = getDatabase();
  const documents = await db
    .select({
      id: schema.documents.id,
      label: schema.documents.label,
      status: schema.documents.status,
      isMandatory: schema.documentRequirements.isMandatory,
      requirementId: schema.documents.requirementId,
      currentVersionId: schema.documents.currentVersionId,
      reviewerRemarks: schema.documents.reviewerRemarks,
    })
    .from(schema.documents)
    .innerJoin(
      schema.documentRequirements,
      eq(schema.documentRequirements.id, schema.documents.requirementId),
    )
    .where(eq(schema.documents.caseId, caseRow.id));

  const clarifications = await db
    .select({
      id: schema.clarificationRequests.id,
      issueSummary: schema.clarificationRequests.issueSummary,
      requiredAction: schema.clarificationRequests.requiredAction,
      remarks: schema.clarificationRequests.remarks,
      dueDate: schema.clarificationRequests.dueDate,
      status: schema.clarificationRequests.status,
      requestedAt: schema.clarificationRequests.requestedAt,
      respondedAt: schema.clarificationRequests.respondedAt,
      responseText: schema.clarificationRequests.responseText,
    })
    .from(schema.clarificationRequests)
    .where(eq(schema.clarificationRequests.caseId, caseRow.id))
    .orderBy(asc(schema.clarificationRequests.requestedAt));

  const readiness = await evaluateReadiness(caseRow.id);
  const missingProfileFields = await collectMissingProfileFields(profile.id, caseRow.packageId);

  const actionRequired =
    readiness.missing.openClarifications.length > 0 ||
    documents.some((document) => document.status === "CLARIFICATION_REQUIRED");

  res.status(200).json({
    data: {
      caseId: caseRow.id,
      candidateId: profile.candidateId,
      caseNumber: caseRow.caseNumber,
      status: caseRow.status,
      statusLabel:
        CANDIDATE_VISIBLE_STATUSES[caseRow.status as keyof typeof CANDIDATE_VISIBLE_STATUSES] ??
        caseRow.status,
      submittedAt: caseRow.submittedAt?.toISOString() ?? null,
      actionRequired,
      readiness: {
        ready: readiness.ready,
        missingProfileFields,
        missingDocuments: readiness.missing.documents,
        consent: readiness.missing.consent,
        openClarifications: readiness.missing.openClarifications,
      },
      documents: documents.map((document) => ({
        id: document.id,
        requirementId: document.requirementId,
        label: document.label,
        status: document.status,
        isMandatory: document.isMandatory,
        uploaded: Boolean(document.currentVersionId),
        reviewerRemarks: document.status === "CLARIFICATION_REQUIRED" ? document.reviewerRemarks : null,
      })),
      clarifications: clarifications.map((clarification) => ({
        id: clarification.id,
        issueSummary: clarification.issueSummary,
        requiredAction: clarification.requiredAction,
        remarks: clarification.remarks,
        dueDate: clarification.dueDate,
        status: clarification.status,
        requestedAt: clarification.requestedAt.toISOString(),
        respondedAt: clarification.respondedAt?.toISOString() ?? null,
        responseText: clarification.responseText,
        isOverdue:
          clarification.dueDate !== null &&
          new Date(clarification.dueDate).getTime() < Date.now() &&
          clarification.status !== "CLOSED",
      })),
    },
  });
});

/** Guards routes that require a candidate account. */
function authenticateCandidate(req: Request, _res: Response, next: NextFunction): void {
  if (!req.principal) {
    next(forbidden("Authentication is required"));
    return;
  }
  if (!req.principal.candidateProfileId) {
    next(forbidden("This endpoint is only available to candidate accounts"));
    return;
  }
  next();
}
