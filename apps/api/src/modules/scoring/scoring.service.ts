import type { ScoreRecord, ScoringComponent } from "@checkiq/contracts";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { getDatabase, schema } from "../../db/client.js";
import { notFound, preconditionFailed } from "../../lib/errors.js";
import { newId } from "../../lib/ids.js";
import { recordAudit } from "../../services/audit.service.js";
import { queueNotification } from "../../services/notification.service.js";
import { transitionCase } from "../../services/case.service.js";
import type { Db, Tx } from "../../db/types.js";

/**
 * Scoring service.
 *
 * The score is derived from the check results using an explicit, versioned
 * configuration. Every score records the configuration version and a snapshot
 * of the per-component breakdown, so a historical score stays explainable even
 * after the configuration changes.
 *
 * All arithmetic is performed in integer hundredths of a percent, and the
 * threshold comparison is an exact integer comparison — there is no floating
 * point drift and no epsilon fudge factor.
 */

const RESOLVED_STATUSES = [
  "VERIFIED",
  "PARTIALLY_VERIFIED",
  "UNABLE_TO_VERIFY",
  "DISCREPANCY_FOUND",
  "REJECTED",
] as const;

const UNRESOLVED_STATUSES = [
  "NOT_SUBMITTED",
  "SUBMITTED",
  "UNDER_VERIFICATION",
  "CLARIFICATION_REQUIRED",
] as const;

export interface ScoringComponentRow {
  id: string;
  checkTypeCodes: string[];
  label: string;
  weight: string | number;
  outcomeMultipliers: Record<string, number>;
  excludedStatuses: string[];
}

export interface ComputedScore {
  totalHundredths: number;
  thresholdHundredths: number;
  outcome: "ABOVE_THRESHOLD" | "BELOW_THRESHOLD" | "PROVISIONAL";
  isProvisional: boolean;
  components: {
    checkTypeCodes: string[];
    label: string;
    weight: number;
    ratio: number;
    awardedPoints: number;
    maxPoints: number;
    outcomeCode: string | null;
    contributingChecks: { id: string; label: string; status: string; multiplier: number }[];
  }[];
}

/** Converts a decimal string or number into integer hundredths. */
export function toHundredths(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === "") return 0;
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.round(numeric * 100);
}

/** Loads the active, approved scoring configuration. */
export async function loadActiveScoringConfig(tx: Tx | Db): Promise<{
  id: string;
  version: number;
  threshold: string;
  allowProvisional: boolean;
  components: ScoringComponentRow[];
}> {
  const [config] = await tx
    .select()
    .from(schema.scoringConfigurations)
    .where(
      and(
        eq(schema.scoringConfigurations.status, "ACTIVE"),
        eq(schema.scoringConfigurations.isApproved, true),
      ),
    )
    .limit(1);

  if (!config) {
    throw preconditionFailed(
      "No active, approved scoring configuration is available. An administrator must approve one before scores can be produced.",
    );
  }

  const components = await tx
    .select()
    .from(schema.scoringConfigComponents)
    .where(eq(schema.scoringConfigComponents.scoringConfigId, config.id));

  return {
    id: config.id,
    version: config.version,
    threshold: config.threshold,
    allowProvisional: config.allowProvisional,
    components: components.map((component: (typeof components)[number]) => ({
      id: component.id,
      checkTypeCodes: component.checkTypeCodes,
      label: component.label,
      weight: component.weight,
      outcomeMultipliers: component.outcomeMultipliers,
      excludedStatuses: component.excludedStatuses,
    })),
  };
}

/**
 * Computes the score for a case.
 *
 * Component weighting rules (see docs/05-scoring-rules.md):
 *  - Each check contributes the multiplier configured for its status.
 *  - Checks whose status is excluded (waived / not applicable) are removed from
 *    both the numerator and the denominator of their component.
 *  - A component's ratio is the mean multiplier of its contributing checks.
 *  - Components with no contributing checks are removed from the total, and the
 *    remaining weights are renormalised — a case is never penalised for a check
 *    the package did not include.
 */
export function computeScore(
  components: ScoringComponentRow[],
  checks: { id: string; checkTypeCode: string; label: string; status: string }[],
  threshold: string | number,
  provisional: boolean,
): ComputedScore {
  const thresholdHundredths = toHundredths(threshold);

  const computed: ComputedScore["components"] = [];
  let eligibleWeight = 0;
  let weightedHundredths = 0;

  for (const component of components) {
    const contributing = checks.filter(
      (check) =>
        component.checkTypeCodes.includes(check.checkTypeCode) &&
        !component.excludedStatuses.includes(check.status),
    );
    if (contributing.length === 0) continue;

    const weightHundredths = toHundredths(component.weight);
    const ratios = contributing.map(
      (check) => component.outcomeMultipliers[check.status] ?? 0,
    );
    const ratio = ratios.reduce((sum, value) => sum + value, 0) / ratios.length;

    eligibleWeight += weightHundredths;
    weightedHundredths += Math.round(weightHundredths * ratio);

    computed.push({
      checkTypeCodes: component.checkTypeCodes,
      label: component.label,
      weight: weightHundredths / 100,
      ratio: Math.round(ratio * 10000) / 10000,
      awardedPoints: Math.round(ratio * 100) / 100,
      maxPoints: 1,
      outcomeCode: null,
      contributingChecks: contributing.map((check, index) => ({
        id: check.id,
        label: check.label,
        status: check.status,
        multiplier: ratios[index] ?? 0,
      })),
    });
  }

  if (eligibleWeight === 0) {
    throw preconditionFailed("The scoring configuration has no components that apply to this case.");
  }

  // Weighted mean over the components that apply, scaled to 100%. Rounded
  // half-up to the nearest hundredth of a percent.
  const totalHundredths = Math.round((weightedHundredths / eligibleWeight) * 10_000);

  const outcome: ComputedScore["outcome"] = provisional
    ? "PROVISIONAL"
    : totalHundredths >= thresholdHundredths
      ? "ABOVE_THRESHOLD"
      : "BELOW_THRESHOLD";

  return {
    totalHundredths,
    thresholdHundredths,
    outcome,
    isProvisional: provisional,
    components: computed,
  };
}

export interface ScoreGenerationResult {
  score: ScoreRecord;
  caseStatus: string;
}

/**
 * Generates the score for a case and records it.
 */
export async function generateScore(
  caseId: string,
  actor: { userId: string | null; fullName: string | null; role: string | null },
  options: { force?: boolean } = {},
): Promise<ScoreGenerationResult> {
  const { db } = getDatabase();

  const [caseRow] = await db.select().from(schema.bgvCases).where(eq(schema.bgvCases.id, caseId)).limit(1);
  if (!caseRow) throw notFound("Case not found");

    const checks = await db
    .select({
      id: schema.verificationChecks.id,
      checkTypeCode: schema.verificationChecks.checkTypeCode,
      label: schema.verificationChecks.label,
      status: schema.verificationChecks.status,
      isMandatory: schema.verificationChecks.isMandatory,
    })
    .from(schema.verificationChecks)
    .where(eq(schema.verificationChecks.caseId, caseId));

  const unresolvedMandatory = checks.filter(
    (check) => check.isMandatory && (UNRESOLVED_STATUSES as readonly string[]).includes(check.status),
  );

  const clarifications = await db
    .select({ id: schema.clarificationRequests.id })
    .from(schema.clarificationRequests)
    .where(
      and(
        eq(schema.clarificationRequests.caseId, caseId),
        inArray(schema.clarificationRequests.status, ["OPEN", "RESPONDED"]),
      ),
    );

  const config = await loadActiveScoringConfig(db);

  const blocked = unresolvedMandatory.length > 0 || clarifications.length > 0;
  if (blocked && !(options.force && config.allowProvisional)) {
    throw preconditionFailed(
      "A score cannot be produced while required checks or clarifications are outstanding.",
      {
        unresolvedChecks: unresolvedMandatory.map((check) => ({
          id: check.id,
          label: check.label,
          status: check.status,
        })),
        openClarifications: clarifications.length,
      },
    );
  }

  const computed = computeScore(config.components, checks, config.threshold, blocked);

  const scoreId = newId();
  const now = new Date();

  const eligibilityResult =
    computed.outcome === "ABOVE_THRESHOLD"
      ? "ELIGIBLE"
      : computed.outcome === "BELOW_THRESHOLD"
        ? "BELOW_THRESHOLD"
        : "PROVISIONAL";

  await db.transaction(async (tx) => {
    await tx
      .update(schema.bgvScores)
      .set({ supersededAt: now })
      .where(and(eq(schema.bgvScores.caseId, caseId), isNull(schema.bgvScores.supersededAt)));

    await tx.insert(schema.bgvScores).values({
      id: scoreId,
      caseId,
      scoringConfigId: config.id,
      scoringConfigVersion: config.version,
      totalScore: (computed.totalHundredths / 100).toFixed(2),
      threshold: (computed.thresholdHundredths / 100).toFixed(2),
      outcome: computed.outcome,
      isProvisional: computed.isProvisional,
      isManualAdjustment: false,
      components: computed.components as unknown as Record<string, unknown>[],
      generatedBy: actor.userId,
      generatedAt: now,
    });

    await tx
      .update(schema.bgvCases)
      .set({
        score: (computed.totalHundredths / 100).toFixed(2),
        scoreOutcome: computed.outcome,
        eligibilityResult,
        updatedAt: now,
      })
      .where(eq(schema.bgvCases.id, caseId));

    if (caseRow.status === "VERIFICATION_COMPLETED" || caseRow.status === "BGV_REVIEW_REQUIRED") {
      await transitionCase(tx, {
        caseId,
        to: "BGV_SCORE_GENERATED",
        actor: { userId: actor.userId, fullName: actor.fullName, role: actor.role },
        reason: "Score generated",
        metadata: {
          totalScore: computed.totalHundredths / 100,
          scoringConfigVersion: config.version,
        },
      });
    }

    if (computed.outcome === "BELOW_THRESHOLD") {
      await transitionCase(tx, {
        caseId,
        to: "BGV_REVIEW_REQUIRED",
        actor: { userId: actor.userId, fullName: actor.fullName, role: actor.role },
        reason: "Score is below the configured threshold — review required",
        metadata: { totalScore: computed.totalHundredths / 100, threshold: computed.thresholdHundredths / 100 },
      });
    }

    await recordAudit(
      {
        action: "SCORE_GENERATED",
        actorId: actor.userId,
        actorName: actor.fullName,
        actorRole: actor.role,
        entityType: "bgv_score",
        entityId: scoreId,
        caseId,
        newValue: {
          totalScore: computed.totalHundredths / 100,
          threshold: computed.thresholdHundredths / 100,
          outcome: computed.outcome,
          scoringConfigVersion: config.version,
          isProvisional: computed.isProvisional,
        },
        ipAddress: null,
        requestId: null,
      },
      tx,
    );
  });

  const score = await getCurrentScore(caseId);

  // The reviewer is told that a score exists, and — when the score is below
  // the threshold — that the case needs a review decision.
  const reviewerId = caseRow.assignedReviewerId;
  if (reviewerId) {
    await queueNotification({
      event: "SCORE_GENERATED",
      recipientUserId: reviewerId,
      caseId,
      deduplicationKey: `score-generated-${scoreId}`,
      variables: {
        caseNumber: caseRow.caseNumber,
        score: (computed.totalHundredths / 100).toFixed(2),
      },
    });

    if (computed.outcome === "BELOW_THRESHOLD") {
      await queueNotification({
        event: "REVIEW_REQUIRED",
        recipientUserId: reviewerId,
        caseId,
        deduplicationKey: `review-required-${scoreId}`,
        variables: { caseNumber: caseRow.caseNumber },
      });
    }
  }

  return { score, caseStatus: computed.outcome === "BELOW_THRESHOLD" ? "BGV_REVIEW_REQUIRED" : "BGV_SCORE_GENERATED" };
}

/** Returns the latest (non-superseded) score of a case. */
export async function getCurrentScore(caseId: string): Promise<ScoreRecord> {
  const { db } = getDatabase();
  const [row] = await db
    .select()
    .from(schema.bgvScores)
    .where(eq(schema.bgvScores.caseId, caseId))
    .orderBy(desc(schema.bgvScores.generatedAt))
    .limit(1);
  if (!row) throw notFound("No score has been generated for this case");

  return {
    id: row.id,
    caseId: row.caseId,
    scoringConfigVersion: row.scoringConfigVersion,
    totalScore: Number(row.totalScore),
    threshold: Number(row.threshold),
    outcome: row.outcome as ScoreRecord["outcome"],
    isProvisional: row.isProvisional,
    components: (row.components as unknown as ScoringComponent[]) ?? [],
    generatedAt: row.generatedAt.toISOString(),
    generatedById: row.generatedBy,
    adjustment:
      row.isManualAdjustment && row.previousScore !== null
        ? {
            adjustedScore: Number(row.totalScore),
            previousScore: Number(row.previousScore),
            reason: row.adjustmentReason ?? "",
            adjustedById: row.adjustedBy ?? "",
            adjustedByName: null,
            adjustedAt: row.adjustedAt?.toISOString() ?? "",
          }
        : null,
  };
}

/** Returns the full score history of a case. */
export async function listScoreHistory(caseId: string) {
  const { db } = getDatabase();
  const rows = await db
    .select()
    .from(schema.bgvScores)
    .where(eq(schema.bgvScores.caseId, caseId))
    .orderBy(asc(schema.bgvScores.generatedAt));
  return rows.map((row) => ({
    id: row.id,
    scoringConfigVersion: row.scoringConfigVersion,
    totalScore: Number(row.totalScore),
    threshold: Number(row.threshold),
    outcome: row.outcome,
    isProvisional: row.isProvisional,
    isManualAdjustment: row.isManualAdjustment,
    previousScore: row.previousScore === null ? null : Number(row.previousScore),
    adjustmentReason: row.adjustmentReason,
    generatedAt: row.generatedAt.toISOString(),
    supersededAt: row.supersededAt?.toISOString() ?? null,
  }));
}

export { RESOLVED_STATUSES, UNRESOLVED_STATUSES };
