import { z } from "zod";
import { scoreOutcomeSchema } from "./enums.js";

export const scoringComponentSchema = z.object({
  /** Check type codes aggregated by this component, e.g. ["EMPLOYMENT","DESIGNATION"]. */
  checkTypeCodes: z.array(z.string()),
  label: z.string(),
  weight: z.number().nonnegative(),
  outcomeCode: z.string().nullable(),
  awardedPoints: z.number().nullable(),
  maxPoints: z.number().nonnegative(),
});
export type ScoringComponent = z.infer<typeof scoringComponentSchema>;

export const scoreRecordSchema = z.object({
  id: z.string().uuid(),
  caseId: z.string().uuid(),
  scoringConfigVersion: z.number().int().positive(),
  totalScore: z.number(),
  threshold: z.number(),
  outcome: scoreOutcomeSchema,
  isProvisional: z.boolean(),
  components: z.array(scoringComponentSchema),
  generatedAt: z.string(),
  generatedById: z.string().uuid().nullable(),
  adjustment: z
    .object({
      adjustedScore: z.number(),
      previousScore: z.number(),
      reason: z.string(),
      adjustedById: z.string().uuid(),
      adjustedByName: z.string().nullable(),
      adjustedAt: z.string(),
    })
    .nullable(),
});
export type ScoreRecord = z.infer<typeof scoreRecordSchema>;

export const scoringConfigSchema = z.object({
  id: z.string().uuid(),
  version: z.number().int().positive(),
  name: z.string(),
  threshold: z.number(),
  components: z.array(scoringComponentSchema.pick({ checkTypeCodes: true, label: true, weight: true })),
  status: z.enum(["DRAFT", "ACTIVE", "RETIRED"]),
  isApproved: z.boolean(),
  approvedById: z.string().uuid().nullable(),
  approvedAt: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string(),
});
export type ScoringConfig = z.infer<typeof scoringConfigSchema>;

export const adjustScoreSchema = z.object({
  adjustedScore: z.number().min(0).max(100),
  reason: z.string().trim().min(5, { error: "A reason is required for score adjustments" }).max(2000),
});
export type AdjustScoreRequest = z.infer<typeof adjustScoreSchema>;

export const createScoringConfigSchema = z.object({
  name: z.string().trim().min(3).max(160),
  threshold: z.number().min(0).max(100),
  components: z
    .array(
      z.object({
        checkTypeCodes: z.array(z.string().trim().min(1).max(64)).min(1),
        label: z.string().trim().min(1).max(160),
        weight: z.number().min(0).max(100),
      }),
    )
    .min(1),
  notes: z.string().trim().max(2000).optional().nullable(),
});
export type CreateScoringConfigRequest = z.infer<typeof createScoringConfigSchema>;
