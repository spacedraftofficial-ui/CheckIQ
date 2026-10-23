import { z } from "zod";
import { reviewStatusSchema } from "./enums.js";

export const reviewSchema = z.object({
  id: z.string().uuid(),
  caseId: z.string().uuid(),
  round: z.number().int().positive(),
  status: reviewStatusSchema,
  reviewerId: z.string().uuid(),
  reviewerName: z.string().nullable(),
  reviewerRole: z.string().nullable(),
  decision: z.string().nullable(),
  remarks: z.string().nullable(),
  returnReason: z.string().nullable(),
  isMakerCheckerSatisfied: z.boolean(),
  createdAt: z.string(),
  decidedAt: z.string().nullable(),
});
export type Review = z.infer<typeof reviewSchema>;

export const recordReviewDecisionSchema = z.object({
  decision: z.enum(["APPROVE", "RETURN_FOR_WORK", "REJECT"]),
  remarks: z.string().trim().max(4000).optional().nullable(),
  returnReason: z.string().trim().max(2000).optional().nullable(),
});
export type RecordReviewDecisionRequest = z.infer<typeof recordReviewDecisionSchema>;

export const approvalSchema = z.object({
  id: z.string().uuid(),
  caseId: z.string().uuid(),
  approvedById: z.string().uuid(),
  approvedByName: z.string().nullable(),
  approvedByRole: z.string().nullable(),
  decision: z.enum(["APPROVED", "REJECTED", "ROUTED_FOR_REVIEW"]),
  remarks: z.string().nullable(),
  createdAt: z.string(),
});
export type Approval = z.infer<typeof approvalSchema>;

export const finalApprovalRequestSchema = z.object({
  decision: z.enum(["APPROVED", "REJECTED", "ROUTED_FOR_REVIEW"]),
  remarks: z.string().trim().max(4000).optional().nullable(),
});
export type FinalApprovalRequest = z.infer<typeof finalApprovalRequestSchema>;
