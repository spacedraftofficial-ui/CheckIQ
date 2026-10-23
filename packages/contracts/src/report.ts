import { z } from "zod";
import { checkTypeCodeSchema } from "./enums.js";

export const reportVerificationResultSchema = z.object({
  checkTypeCode: checkTypeCodeSchema,
  label: z.string(),
  status: z.string(),
  outcomeCode: z.string().nullable(),
  verifierName: z.string().nullable(),
  remarks: z.string().nullable(),
  completedAt: z.string().nullable(),
});
export type ReportVerificationResult = z.infer<typeof reportVerificationResultSchema>;

export const bgvReportSchema = z.object({
  reportId: z.string().uuid(),
  reportNumber: z.string(),
  generatedAt: z.string(),
  caseId: z.string().uuid(),
  caseNumber: z.string(),
  candidateId: z.string(),
  candidateName: z.string(),
  position: z.string().nullable(),
  company: z.string().nullable(),
  department: z.string().nullable(),
  packageName: z.string(),
  initiatedAt: z.string().nullable(),
  submittedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  verificationResults: z.array(reportVerificationResultSchema),
  discrepancies: z.array(z.string()),
  finalScore: z.number().nullable(),
  scoringConfigVersion: z.number().int().nullable(),
  eligibilityResult: z.string().nullable(),
  verifierName: z.string().nullable(),
  reviewerName: z.string().nullable(),
  approverName: z.string().nullable(),
  approvalTimestamp: z.string().nullable(),
});
export type BgvReport = z.infer<typeof bgvReportSchema>;
