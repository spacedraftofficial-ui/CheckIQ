import { Router } from "express";
import { z } from "zod";
import { adjustScoreSchema } from "@checkiq/contracts";
import { requirePermission, requirePrincipal } from "../../middleware/authenticate.js";
import { validate } from "../../middleware/validate.js";
import { getDatabase, schema } from "../../db/client.js";
import { param } from "../../lib/request.js";
import { eq, desc } from "drizzle-orm";
import { newId } from "../../lib/ids.js";
import { recordAudit } from "../../services/audit.service.js";
import { resolveCase } from "../../services/access.service.js";
import { getCurrentScore, generateScore, listScoreHistory, toHundredths } from "./scoring.service.js";

export const scoringRouter = Router();

const caseParams = z.object({ caseId: z.string().uuid() });

/**
 * GET /api/cases/:caseId/score
 */
scoringRouter.get(
  "/cases/:caseId/score",
  requirePrincipal,
  requirePermission("score:read"),
  validate({ params: caseParams }),
  async (req, res) => {
    const { caseRow } = await resolveCase(req.principal!, param(req, "caseId"));
    const score = await getCurrentScore(caseRow.id);
    res.status(200).json({ data: score });
  },
);

/**
 * GET /api/cases/:caseId/scores
 *
 * The append-only score history.
 */
scoringRouter.get(
  "/cases/:caseId/scores",
  requirePrincipal,
  requirePermission("score:read"),
  validate({ params: caseParams }),
  async (req, res) => {
    const { caseRow } = await resolveCase(req.principal!, param(req, "caseId"));
    const scores = await listScoreHistory(caseRow.id);
    res.status(200).json({ data: scores });
  },
);

/**
 * POST /api/cases/:caseId/score/generate
 */
scoringRouter.post(
  "/cases/:caseId/score/generate",
  requirePrincipal,
  requirePermission("score:generate"),
  validate({ params: caseParams }),
  async (req, res) => {
    const { caseRow } = await resolveCase(req.principal!, param(req, "caseId"));
    const result = await generateScore(caseRow.id, {
      userId: req.principal!.userId,
      fullName: req.principal!.fullName,
      role: req.principal!.roles[0] ?? null,
    });
    res.status(201).json({ data: result });
  },
);

/**
 * POST /api/cases/:caseId/score/adjust
 *
 * A manual adjustment. It requires a reason and creates a new score row — the
 * computed score is never modified.
 */
scoringRouter.post(
  "/cases/:caseId/score/adjust",
  requirePrincipal,
  requirePermission("score:adjust"),
  validate({ params: caseParams, body: adjustScoreSchema }),
  async (req, res) => {
    const { caseRow } = await resolveCase(req.principal!, param(req, "caseId"));
    const { db } = getDatabase();

    const current = await getCurrentScore(caseRow.id);
    const latestRow = await db
      .select({ scoringConfigId: schema.bgvScores.scoringConfigId })
      .from(schema.bgvScores)
      .where(eq(schema.bgvScores.caseId, caseRow.id))
      .orderBy(desc(schema.bgvScores.generatedAt))
      .limit(1);

    const adjustedHundredths = toHundredths(req.body.adjustedScore);
    const scoreId = newId();
    const now = new Date();

    await db.transaction(async (tx) => {
      await tx
        .update(schema.bgvScores)
        .set({ supersededAt: now })
        .where(eq(schema.bgvScores.caseId, caseRow.id));

      await tx.insert(schema.bgvScores).values({
        id: scoreId,
        caseId: caseRow.id,
        scoringConfigId: latestRow[0]?.scoringConfigId ?? "",
        scoringConfigVersion: current.scoringConfigVersion,
        totalScore: (adjustedHundredths / 100).toFixed(2),
        threshold: current.threshold.toFixed(2),
        outcome:
          adjustedHundredths >= toHundredths(current.threshold)
            ? "ABOVE_THRESHOLD"
            : "BELOW_THRESHOLD",
        isProvisional: current.isProvisional,
        isManualAdjustment: true,
        previousScore: current.totalScore.toFixed(2),
        adjustmentReason: req.body.reason,
        adjustedBy: req.principal!.userId,
        adjustedAt: now,
        components: current.components as unknown as Record<string, unknown>[],
        generatedBy: req.principal!.userId,
        generatedAt: now,
      });

      await tx
        .update(schema.bgvCases)
        .set({
          score: (adjustedHundredths / 100).toFixed(2),
          scoreOutcome:
            adjustedHundredths >= toHundredths(current.threshold)
              ? "ABOVE_THRESHOLD"
              : "BELOW_THRESHOLD",
          updatedAt: now,
        })
        .where(eq(schema.bgvCases.id, caseRow.id));

      await recordAudit(
        {
          action: "SCORE_ADJUSTED",
          actorId: req.principal!.userId,
          actorName: req.principal!.fullName,
          actorRole: req.principal!.roles[0] ?? null,
          entityType: "bgv_score",
          entityId: scoreId,
          caseId: caseRow.id,
          previousValue: { totalScore: current.totalScore },
          newValue: { totalScore: adjustedHundredths / 100 },
          reason: req.body.reason,
          ipAddress: req.ipAddress ?? null,
          userAgent: req.userAgent ?? null,
          requestId: req.requestId,
        },
        tx,
      );
    });

    const score = await getCurrentScore(caseRow.id);
    res.status(201).json({ data: score });
  },
);
