import { z } from "zod";
import { checkStatusSchema, checkTypeCodeSchema, clarificationStatusSchema } from "./enums.js";

export const verificationCheckSchema = z.object({
  id: z.string().uuid(),
  caseId: z.string().uuid(),
  checkTypeCode: checkTypeCodeSchema,
  label: z.string(),
  isMandatory: z.boolean(),
  weight: z.number().nonnegative(),
  status: checkStatusSchema,
  outcomeCode: z.string().nullable(),
  verifierId: z.string().uuid().nullable(),
  verifierName: z.string().nullable(),
  remarks: z.string().nullable(),
  evidenceReference: z.string().nullable(),
  requiresReview: z.boolean(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type VerificationCheck = z.infer<typeof verificationCheckSchema>;

export const recordCheckResultSchema = z.object({
  status: checkStatusSchema,
  outcomeCode: z.string().trim().max(64).optional().nullable(),
  remarks: z.string().trim().max(4000).optional().nullable(),
  evidenceReference: z.string().trim().max(1000).optional().nullable(),
  requiresReview: z.boolean().optional(),
});
export type RecordCheckResultRequest = z.infer<typeof recordCheckResultSchema>;

export const clarificationRequestSchema = z.object({
  checkId: z.string().uuid().optional().nullable(),
  documentId: z.string().uuid().optional().nullable(),
  issueSummary: z.string().trim().min(5).max(500),
  requiredAction: z.string().trim().min(5).max(2000),
  remarks: z.string().trim().max(4000).optional().nullable(),
  dueDate: z.iso.date().optional().nullable(),
});
export type ClarificationRequestInput = z.infer<typeof clarificationRequestSchema>;

export const clarificationSchema = z.object({
  id: z.string().uuid(),
  caseId: z.string().uuid(),
  checkId: z.string().uuid().nullable(),
  documentId: z.string().uuid().nullable(),
  issueSummary: z.string(),
  requiredAction: z.string(),
  remarks: z.string().nullable(),
  dueDate: z.string().nullable(),
  status: clarificationStatusSchema,
  requestedById: z.string().uuid(),
  requestedByName: z.string().nullable(),
  requestedAt: z.string(),
  respondedAt: z.string().nullable(),
  responseText: z.string().nullable(),
  responseDocumentIds: z.array(z.string().uuid()),
  closedAt: z.string().nullable(),
  closedById: z.string().uuid().nullable(),
  closeReason: z.string().nullable(),
  isOverdue: z.boolean(),
});
export type Clarification = z.infer<typeof clarificationSchema>;

export const clarificationResponseSchema = z.object({
  responseText: z.string().trim().min(1).max(4000),
  documentIds: z.array(z.string().uuid()).optional(),
});
export type ClarificationResponseInput = z.infer<typeof clarificationResponseSchema>;

export const clarificationClosureSchema = z.object({
  reason: z.string().trim().min(3).max(2000),
});
export type ClarificationClosureInput = z.infer<typeof clarificationClosureSchema>;
