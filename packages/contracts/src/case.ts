import { z } from "zod";
import { caseStatusSchema } from "./enums.js";
import { paginationQuerySchema } from "./common.js";

export const caseSchema = z.object({
  id: z.string().uuid(),
  caseNumber: z.string(),
  candidateId: z.string(),
  candidateName: z.string(),
  candidateEmail: z.email(),
  company: z.string().nullable(),
  department: z.string().nullable(),
  position: z.string().nullable(),
  packageId: z.string().uuid(),
  packageName: z.string(),
  status: caseStatusSchema,
  assignedVerifierId: z.string().uuid().nullable(),
  assignedVerifierName: z.string().nullable(),
  assignedReviewerId: z.string().uuid().nullable(),
  assignedReviewerName: z.string().nullable(),
  submittedAt: z.string().nullable(),
  verificationStartedAt: z.string().nullable(),
  verificationCompletedAt: z.string().nullable(),
  score: z.number().nullable(),
  scoreOutcome: z.string().nullable(),
  eligibilityResult: z.string().nullable(),
  openClarificationCount: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string(),
  version: z.number().int().positive(),
});
export type BgvCase = z.infer<typeof caseSchema>;

export const caseListItemSchema = caseSchema.pick({
  id: true,
  caseNumber: true,
  candidateId: true,
  candidateName: true,
  company: true,
  department: true,
  position: true,
  status: true,
  assignedVerifierId: true,
  assignedVerifierName: true,
  score: true,
  scoreOutcome: true,
  submittedAt: true,
  updatedAt: true,
  openClarificationCount: true,
});
export type CaseListItem = z.infer<typeof caseListItemSchema>;

export const caseFiltersSchema = paginationQuerySchema.extend({
  search: z.string().trim().max(120).optional(),
  candidateId: z.string().trim().max(64).optional(),
  status: z.array(caseStatusSchema).optional(),
  assignedVerifierId: z.string().uuid().optional(),
  company: z.string().trim().max(160).optional(),
  department: z.string().trim().max(160).optional(),
  position: z.string().trim().max(160).optional(),
  submittedFrom: z.iso.date().optional(),
  submittedTo: z.iso.date().optional(),
  scoreMin: z.coerce.number().min(0).max(100).optional(),
  scoreMax: z.coerce.number().min(0).max(100).optional(),
});
export type CaseFilters = z.infer<typeof caseFiltersSchema>;

export const caseQueueCountsSchema = z.object({
  total: z.number().int().nonnegative(),
  byStatus: z.record(z.string(), z.number().int().nonnegative()),
  awaitingClarification: z.number().int().nonnegative(),
  belowThreshold: z.number().int().nonnegative(),
});
export type CaseQueueCounts = z.infer<typeof caseQueueCountsSchema>;

export const submitCaseRequestSchema = z.object({
  /** Client-generated idempotency key. Repeated submissions reuse the same key. */
  idempotencyKey: z.string().trim().min(8).max(100),
  confirmDeclaration: z.literal(true),
});
export type SubmitCaseRequest = z.infer<typeof submitCaseRequestSchema>;

export const submitCaseResponseSchema = z.object({
  caseId: z.string().uuid(),
  caseNumber: z.string(),
  status: caseStatusSchema,
  submittedAt: z.string(),
  alreadySubmitted: z.boolean(),
});
export type SubmitCaseResponse = z.infer<typeof submitCaseResponseSchema>;

export const assignCaseSchema = z.object({
  verifierId: z.string().uuid().optional(),
  reviewerId: z.string().uuid().optional(),
  reason: z.string().trim().max(1000).optional(),
});
export type AssignCaseRequest = z.infer<typeof assignCaseSchema>;

export const caseStatusHistorySchema = z.object({
  id: z.string().uuid(),
  fromStatus: caseStatusSchema.nullable(),
  toStatus: caseStatusSchema,
  actorId: z.string().uuid().nullable(),
  actorName: z.string().nullable(),
  actorRole: z.string().nullable(),
  reason: z.string().nullable(),
  createdAt: z.string(),
});
export type CaseStatusHistory = z.infer<typeof caseStatusHistorySchema>;
