import { z } from "zod";
import { documentCategoryCodeSchema, documentStatusSchema } from "./enums.js";

export const documentRequirementSchema = z.object({
  id: z.string().uuid(),
  packageId: z.string().uuid(),
  categoryCode: documentCategoryCodeSchema,
  documentTypeCode: z.string(),
  label: z.string(),
  description: z.string().nullable(),
  isMandatory: z.boolean(),
  displayOrder: z.number().int(),
  maxVersions: z.number().int().positive(),
});
export type DocumentRequirement = z.infer<typeof documentRequirementSchema>;

export const documentVersionSchema = z.object({
  id: z.string().uuid(),
  versionNumber: z.number().int().positive(),
  originalFilename: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  checksumSha256: z.string(),
  uploadedAt: z.string(),
  uploadedBy: z.string(),
  isCurrent: z.boolean(),
  malwareScanStatus: z.enum(["PENDING", "CLEAN", "INFECTED", "SKIPPED", "ERROR"]),
});
export type DocumentVersion = z.infer<typeof documentVersionSchema>;

export const documentSchema = z.object({
  id: z.string().uuid(),
  requirementId: z.string().uuid(),
  caseId: z.string().uuid(),
  categoryCode: documentCategoryCodeSchema,
  documentTypeCode: z.string(),
  label: z.string(),
  status: documentStatusSchema,
  /** True when the package requires this document. */
  isMandatory: z.boolean(),
  currentVersion: documentVersionSchema.nullable(),
  versionCount: z.number().int().nonnegative(),
  assignedVerifierId: z.string().uuid().nullable(),
  assignedVerifierName: z.string().nullable(),
  verifiedAt: z.string().nullable(),
  reviewerRemarks: z.string().nullable(),
  evidenceReference: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Document = z.infer<typeof documentSchema>;

export const documentStatusUpdateSchema = z.object({
  status: documentStatusSchema,
  remarks: z.string().trim().max(2000).optional().nullable(),
  evidenceReference: z.string().trim().max(500).optional().nullable(),
  clarificationRequired: z.boolean().optional(),
});
export type DocumentStatusUpdateRequest = z.infer<typeof documentStatusUpdateSchema>;

export const uploadDocumentResponseSchema = z.object({
  document: documentSchema,
  version: documentVersionSchema,
});
export type UploadDocumentResponse = z.infer<typeof uploadDocumentResponseSchema>;

export const uploadValidationRulesSchema = z.object({
  maxFileSizeBytes: z.number().int().positive(),
  allowedMimeTypes: z.array(z.string()),
  allowedExtensions: z.array(z.string()),
});
export type UploadValidationRules = z.infer<typeof uploadValidationRulesSchema>;
