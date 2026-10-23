import { and, eq, inArray } from "drizzle-orm";
import { getDatabase, schema } from "../db/client.js";
import { collectMissingProfileFields } from "../modules/candidates/profile.service.js";
import { getBooleanConfig } from "./config.service.js";

/**
 * Submission readiness.
 *
 * The server decides whether a case can be submitted and, when it cannot,
 * exactly which items are outstanding. The client renders that list — it never
 * computes readiness itself.
 */

export interface ReadinessMissingDocuments {
  requirementId: string;
  label: string;
  status: string;
  isMandatory: boolean;
}

export interface ReadinessResult {
  ready: boolean;
  missing: {
    profileFields: string[];
    documents: ReadinessMissingDocuments[];
    consent: {
      required: boolean;
      currentVersionId: string | null;
      accepted: boolean;
    };
    openClarifications: { id: string; issueSummary: string; dueDate: string | null }[];
  };
}

export async function evaluateReadiness(caseId: string): Promise<ReadinessResult> {
  const { db } = getDatabase();

  const [caseRow] = await db
    .select()
    .from(schema.bgvCases)
    .where(eq(schema.bgvCases.id, caseId))
    .limit(1);
  if (!caseRow) {
    return {
      ready: false,
      missing: {
        profileFields: [],
        documents: [],
        consent: { required: true, currentVersionId: null, accepted: false },
        openClarifications: [],
      },
    };
  }

  const missingProfileFields = await collectMissingProfileFields(caseRow.profileId, caseRow.packageId);

  const documents = await db
    .select({
      id: schema.documents.id,
      requirementId: schema.documents.requirementId,
      label: schema.documents.label,
      status: schema.documents.status,
      isMandatory: schema.documentRequirements.isMandatory,
      currentVersionId: schema.documents.currentVersionId,
    })
    .from(schema.documents)
    .innerJoin(
      schema.documentRequirements,
      eq(schema.documentRequirements.id, schema.documents.requirementId),
    )
    .where(eq(schema.documents.caseId, caseId));

  const missingDocuments: ReadinessMissingDocuments[] = documents
    .filter(
      (document) =>
        document.isMandatory &&
        (document.status === "MISSING" ||
          document.status === "REJECTED" ||
          document.status === "CLARIFICATION_REQUIRED" ||
          !document.currentVersionId),
    )
    .map((document) => ({
      requirementId: document.requirementId,
      label: document.label,
      status: document.status,
      isMandatory: document.isMandatory,
    }));

  const consentRequired = await getBooleanConfig("submission.require_consent", true);
  const [activeConsent] = await db
    .select({ id: schema.consentVersions.id })
    .from(schema.consentVersions)
    .where(eq(schema.consentVersions.isActive, true))
    .orderBy(schema.consentVersions.effectiveFrom)
    .limit(1);

  let consentAccepted = false;
  if (activeConsent) {
    const [acceptance] = await db
      .select({ id: schema.consentAcceptances.id })
      .from(schema.consentAcceptances)
      .where(
        and(
          eq(schema.consentAcceptances.profileId, caseRow.profileId),
          eq(schema.consentAcceptances.consentVersionId, activeConsent.id),
        ),
      )
      .limit(1);
    consentAccepted = Boolean(acceptance);
  }

  const clarifications = await db
    .select({
      id: schema.clarificationRequests.id,
      issueSummary: schema.clarificationRequests.issueSummary,
      dueDate: schema.clarificationRequests.dueDate,
      status: schema.clarificationRequests.status,
    })
    .from(schema.clarificationRequests)
    .where(eq(schema.clarificationRequests.caseId, caseId));

  const openClarifications = clarifications
    .filter((clarification) => clarification.status === "OPEN" || clarification.status === "RESPONDED")
    .map((clarification) => ({
      id: clarification.id,
      issueSummary: clarification.issueSummary,
      dueDate: clarification.dueDate,
    }));

  const ready =
    missingProfileFields.length === 0 &&
    missingDocuments.length === 0 &&
    (!consentRequired || consentAccepted) &&
    openClarifications.length === 0;

  return {
    ready,
    missing: {
      profileFields: missingProfileFields,
      documents: missingDocuments,
      consent: {
        required: consentRequired,
        currentVersionId: activeConsent?.id ?? null,
        accepted: consentAccepted,
      },
      openClarifications,
    },
  };
}

/** Lists the requirement ids a candidate still has to satisfy. */
export async function outstandingRequirementIds(caseId: string): Promise<string[]> {
  const readiness = await evaluateReadiness(caseId);
  return readiness.missing.documents.map((document) => document.requirementId);
}

export async function countOpenClarificationsForCase(caseId: string): Promise<number> {
  const { db } = getDatabase();
  const rows = await db
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
