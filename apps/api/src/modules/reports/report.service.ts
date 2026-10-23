import type { BgvReport } from "@checkiq/contracts";
import { and, asc, desc, eq } from "drizzle-orm";
import { getDatabase, schema } from "../../db/client.js";
import { newId } from "../../lib/ids.js";
import { formatReportNumber, nextSequence } from "../../lib/sequence.js";
import { recordAudit } from "../../services/audit.service.js";

/**
 * Internal BGV report.
 *
 * The report contains only what its purpose requires: identification,
 * verification outcomes, the score with its configuration version, the
 * eligibility result and the people involved. It is available to roles
 * holding `report:read` and is never exposed to the candidate.
 */
export async function buildBgvReport(
  caseId: string,
  actor: { userId: string; fullName: string; role: string | null },
): Promise<BgvReport> {
  const { db } = getDatabase();

  const [caseRow] = await db
    .select()
    .from(schema.bgvCases)
    .where(eq(schema.bgvCases.id, caseId))
    .limit(1);
  if (!caseRow) throw new Error("Case not found");

  const [profile] = await db
    .select()
    .from(schema.candidateProfiles)
    .where(eq(schema.candidateProfiles.id, caseRow.profileId))
    .limit(1);

  const [pkg] = await db
    .select({ name: schema.bgvPackages.name })
    .from(schema.bgvPackages)
    .where(eq(schema.bgvPackages.id, caseRow.packageId))
    .limit(1);

  const checks = await db
    .select({
      id: schema.verificationChecks.id,
      checkTypeCode: schema.verificationChecks.checkTypeCode,
      label: schema.verificationChecks.label,
      status: schema.verificationChecks.status,
      outcomeCode: schema.verificationChecks.outcomeCode,
      remarks: schema.verificationChecks.remarks,
      completedAt: schema.verificationChecks.completedAt,
      verifierName: schema.users.fullName,
    })
    .from(schema.verificationChecks)
    .leftJoin(schema.users, eq(schema.users.id, schema.verificationChecks.verifierId))
    .where(eq(schema.verificationChecks.caseId, caseId))
    .orderBy(asc(schema.verificationChecks.createdAt));

  const [score] = await db
    .select()
    .from(schema.bgvScores)
    .where(eq(schema.bgvScores.caseId, caseId))
    .orderBy(desc(schema.bgvScores.generatedAt))
    .limit(1);

  const [approval] = await db
    .select({
      approvedByName: schema.users.fullName,
      createdAt: schema.approvals.createdAt,
      decision: schema.approvals.decision,
    })
    .from(schema.approvals)
    .leftJoin(schema.users, eq(schema.users.id, schema.approvals.approvedBy))
    .where(eq(schema.approvals.caseId, caseId))
    .orderBy(desc(schema.approvals.createdAt))
    .limit(1);

  const [review] = await db
    .select({ reviewerName: schema.users.fullName })
    .from(schema.reviews)
    .leftJoin(schema.users, eq(schema.users.id, schema.reviews.reviewerId))
    .where(eq(schema.reviews.caseId, caseId))
    .orderBy(desc(schema.reviews.round))
    .limit(1);

  const verifierName = checks.find((check) => check.verifierName)?.verifierName ?? null;
  const reportId = newId();
  const reportNumber = formatReportNumber(await nextSequence("bgv_report"));

  await recordAudit({
    action: "REPORT_GENERATED",
    actorId: actor.userId,
    actorName: actor.fullName,
    actorRole: actor.role,
    entityType: "bgv_report",
    entityId: reportId,
    caseId,
    newValue: { reportNumber },
  });

  const discrepancies = checks
    .filter((check) => check.status === "DISCREPANCY_FOUND" || check.status === "REJECTED")
    .map(
      (check) =>
        `${check.label}: ${check.outcomeCode ?? check.status}${check.remarks ? ` — ${check.remarks}` : ""}`,
    );

  return {
    reportId,
    reportNumber,
    generatedAt: new Date().toISOString(),
    caseId,
    caseNumber: caseRow.caseNumber,
    candidateId: profile?.candidateId ?? "",
    candidateName: profile?.fullName ?? "",
    position: caseRow.position,
    company: caseRow.company,
    department: caseRow.department,
    packageName: pkg?.name ?? "",
    initiatedAt: caseRow.initiatedAt?.toISOString() ?? null,
    submittedAt: caseRow.submittedAt?.toISOString() ?? null,
    completedAt: caseRow.verificationCompletedAt?.toISOString() ?? caseRow.closedAt?.toISOString() ?? null,
    verificationResults: checks.map((check) => ({
      checkTypeCode: check.checkTypeCode as BgvReport["verificationResults"][number]["checkTypeCode"],
      label: check.label,
      status: check.status,
      outcomeCode: check.outcomeCode,
      verifierName: check.verifierName,
      remarks: check.remarks,
      completedAt: check.completedAt?.toISOString() ?? null,
    })),
    discrepancies,
    finalScore: score ? Number(score.totalScore) : null,
    scoringConfigVersion: score?.scoringConfigVersion ?? null,
    eligibilityResult: caseRow.eligibilityResult,
    verifierName,
    reviewerName: review?.reviewerName ?? null,
    approverName: approval?.approvedByName ?? null,
    approvalTimestamp: approval?.createdAt.toISOString() ?? null,
  };
}

export { and };
