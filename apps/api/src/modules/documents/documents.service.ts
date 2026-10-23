import type { Document } from "@checkiq/contracts";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getDatabase, schema } from "../../db/client.js";
import { newId } from "../../lib/ids.js";
import { recordAudit } from "../../services/audit.service.js";

/**
 * Document read models.
 *
 * Documents are read through a service so that the same masking and access
 * rules apply to the candidate view and the staff view.
 */

export async function listCaseDocuments(caseId: string): Promise<Document[]> {
  const { db } = getDatabase();
  const rows = await db
    .select({
      id: schema.documents.id,
      requirementId: schema.documents.requirementId,
      caseId: schema.documents.caseId,
      documentTypeId: schema.documents.documentTypeId,
      label: schema.documents.label,
      status: schema.documents.status,
      currentVersionId: schema.documents.currentVersionId,
      assignedVerifierId: schema.documents.assignedVerifierId,
      verifiedAt: schema.documents.verifiedAt,
      reviewerRemarks: schema.documents.reviewerRemarks,
      evidenceReference: schema.documents.evidenceReference,
      versionCount: schema.documents.versionCount,

      isMandatory: schema.documentRequirements.isMandatory,
      createdAt: schema.documents.createdAt,
      updatedAt: schema.documents.updatedAt,
      categoryCode: schema.documentCategories.code,
      documentTypeCode: schema.documentTypes.code,
      verifierName: schema.users.fullName,
    })
    .from(schema.documents)
    .innerJoin(
      schema.documentTypes,
      eq(schema.documentTypes.id, schema.documents.documentTypeId),
    )
    .innerJoin(
      schema.documentCategories,
      eq(schema.documentCategories.id, schema.documentTypes.categoryId),
    )
    .innerJoin(
      schema.documentRequirements,
      eq(schema.documentRequirements.id, schema.documents.requirementId),
    )
    .leftJoin(schema.users, eq(schema.users.id, schema.documents.assignedVerifierId))
    .where(eq(schema.documents.caseId, caseId))
    .orderBy(schema.documents.createdAt);

  const documentIds = rows.map((row) => row.id);
  const versions = documentIds.length
    ? await db
        .select()
        .from(schema.documentVersions)
        .where(
          and(
            eq(schema.documentVersions.isCurrent, true),
            inArray(schema.documentVersions.documentId, documentIds),
          ),
        )
    : [];

  return rows.map((row) => {
    const current = versions.find((version) => version.documentId === row.id) ?? null;
    return {
      id: row.id,
      requirementId: row.requirementId,
      caseId: row.caseId,
      categoryCode: row.categoryCode as Document["categoryCode"],
      documentTypeCode: row.documentTypeCode,
      label: row.label,
      status: row.status as Document["status"],
      isMandatory: row.isMandatory,
      currentVersion: current
        ? {
            id: current.id,
            versionNumber: current.versionNumber,
            originalFilename: current.originalFilename,
            mimeType: current.mimeType,
            sizeBytes: current.sizeBytes,
            checksumSha256: current.checksumSha256,
            uploadedAt: current.uploadedAt.toISOString(),
            uploadedBy: current.uploadedBy,
            isCurrent: current.isCurrent,
            malwareScanStatus: current.malwareScanStatus as NonNullable<Document["currentVersion"]>["malwareScanStatus"],
          }
        : null,
      versionCount: row.versionCount,
      assignedVerifierId: row.assignedVerifierId,
      assignedVerifierName: row.verifierName,
      verifiedAt: row.verifiedAt?.toISOString() ?? null,
      reviewerRemarks: row.reviewerRemarks,
      evidenceReference: row.evidenceReference,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  });
}

export async function listDocumentVersions(documentId: string) {
  const { db } = getDatabase();
  const rows = await db
    .select({
      id: schema.documentVersions.id,
      versionNumber: schema.documentVersions.versionNumber,
      originalFilename: schema.documentVersions.originalFilename,
      mimeType: schema.documentVersions.mimeType,
      sizeBytes: schema.documentVersions.sizeBytes,
      checksumSha256: schema.documentVersions.checksumSha256,
      uploadedAt: schema.documentVersions.uploadedAt,
      uploadedBy: schema.documentVersions.uploadedBy,
      isCurrent: schema.documentVersions.isCurrent,
      malwareScanStatus: schema.documentVersions.malwareScanStatus,
      uploaderName: schema.users.fullName,
    })
    .from(schema.documentVersions)
    .leftJoin(schema.users, eq(schema.users.id, schema.documentVersions.uploadedBy))
    .where(eq(schema.documentVersions.documentId, documentId))
    .orderBy(desc(schema.documentVersions.versionNumber));

  return rows.map((row) => ({
    id: row.id,
    versionNumber: row.versionNumber,
    originalFilename: row.originalFilename,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    checksumSha256: row.checksumSha256,
    uploadedAt: row.uploadedAt.toISOString(),
    uploadedBy: row.uploadedBy,
    isCurrent: row.isCurrent,
    malwareScanStatus: row.malwareScanStatus,
    uploaderName: row.uploaderName,
  }));
}

export { recordAudit, newId };
