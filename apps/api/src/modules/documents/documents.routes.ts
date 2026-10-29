import { Router } from "express";
import multer from "multer";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDatabase, schema } from "../../db/client.js";
import { param } from "../../lib/request.js";
import { requirePermission, requirePrincipal } from "../../middleware/authenticate.js";
import { uploadRateLimit } from "../../middleware/rate-limit.js";
import { validate } from "../../middleware/validate.js";
import { forbidden, notFound, uploadRejected } from "../../lib/errors.js";
import { newId } from "../../lib/ids.js";
import { loadUploadRules, validateUpload } from "../../lib/file-validation.js";
import { createScanner } from "../../lib/scanner.js";
import { storeUploadedFile, temporaryDirectory } from "../../lib/storage.js";
import { recordAudit } from "../../services/audit.service.js";
import { queueNotification } from "../../services/notification.service.js";
import { resolveCase } from "../../services/access.service.js";
import { listCaseDocuments, listDocumentVersions } from "./documents.service.js";

export const documentsRouter = Router();

const upload = multer({
  dest: temporaryDirectory(),
  limits: {
    fileSize: 3 * 1024 * 1024,
    files: 10,
  },
});

const caseParams = z.object({ caseId: z.string().uuid() });
const requirementParams = z.object({
  caseId: z.string().uuid(),
  requirementId: z.string().uuid(),
});
const documentParams = z.object({ documentId: z.string().uuid() });
const versionParams = z.object({
  documentId: z.string().uuid(),
  versionId: z.string().uuid(),
});

/**
 * GET /api/cases/:caseId/documents
 *
 * Lists the documents of a case. A candidate sees their own case; staff must
 * have access to the case.
 */
documentsRouter.get(
  "/cases/:caseId/documents",
  requirePrincipal,
  validate({ params: caseParams }),
  async (req, res) => {
    const { caseRow } = await resolveCase(req.principal!, param(req, "caseId"));
    const documents = await listCaseDocuments(caseRow.id);
    res.status(200).json({ data: documents });
  },
);

/**
 * POST /api/cases/:caseId/documents/:requirementId/upload
 *
 * Uploads a document against a package requirement. Re-uploading creates a new
 * version and supersedes — never overwrites — the previous one.
 */
documentsRouter.post(
  "/cases/:caseId/documents/:requirementId/upload",
  requirePrincipal,
  uploadRateLimit,
  upload.single("file"),
  validate({ params: requirementParams }),
  async (req, res) => {
    const { caseRow, profile } = await resolveCase(req.principal!, param(req, "caseId"));
    const principalCandidateId = req.principal!.candidateId ?? null;
    const file = req.file;
    if (!file) throw uploadRejected("No file was uploaded");

    const rules = await loadUploadRules();
    let validated;
    try {
      validated = await validateUpload(
        file.path,
        file.originalname,
        file.mimetype,
        file.size,
        rules,
      );
    } catch (error) {
      // Never leave an unvalidated file behind.
      const { rm } = await import("node:fs/promises");
      await rm(file.path, { force: true });
      throw error;
    }

    const scanner = createScanner();
    const scan = await scanner.scan(file.path);

    const stored = await storeUploadedFile(file.path, validated.mimeType);

    const { db } = getDatabase();
    const [requirement] = await db
      .select({
        id: schema.documentRequirements.id,
        documentTypeId: schema.documentRequirements.documentTypeId,
        label: schema.documentRequirements.label,
        isMandatory: schema.documentRequirements.isMandatory,
        maxVersions: schema.documentRequirements.maxVersions,
      })
      .from(schema.documentRequirements)
      .where(
        and(
          eq(schema.documentRequirements.id, param(req, "requirementId")),
          eq(schema.documentRequirements.packageId, caseRow.packageId),
        ),
      )
      .limit(1);
    if (!requirement) {
      throw notFound("That document is not required by this background verification package");
    }

    const [existingDocument] = await db
      .select()
      .from(schema.documents)
      .where(
        and(
          eq(schema.documents.caseId, caseRow.id),
          eq(schema.documents.requirementId, requirement.id),
        ),
      )
      .limit(1);

    const isReplacement = Boolean(existingDocument?.currentVersionId);
    const documentId = existingDocument?.id ?? newId();
    const versionNumber = (existingDocument?.versionCount ?? 0) + 1;
    const versionId = newId();

    await db.transaction(async (tx) => {
      if (existingDocument) {
        await tx
          .update(schema.documentVersions)
          .set({ isCurrent: false, supersededAt: new Date() })
          .where(
            and(
              eq(schema.documentVersions.documentId, documentId),
              eq(schema.documentVersions.isCurrent, true),
            ),
          );
      }

      await tx.insert(schema.documentVersions).values({
        id: versionId,
        documentId,
        versionNumber,
        storageKey: stored.storageKey,
        originalFilename: file.originalname.slice(0, 255),
        mimeType: stored.mimeType,
        sizeBytes: stored.sizeBytes,
        checksumSha256: stored.checksumSha256,
        malwareScanStatus: scan.status,
        malwareScanDetail: scan.detail?.slice(0, 500) ?? null,
        uploadedBy: req.principal!.userId,
        isCurrent: true,
      });

      await tx
        .update(schema.documents)
        .set({
          currentVersionId: versionId,
          status: "UPLOADED",
          versionCount: versionNumber,
          verifiedAt: null,
          reviewerRemarks: null,
          updatedAt: new Date(),
        })
        .where(eq(schema.documents.id, documentId));

      await recordAudit(
        {
          action: isReplacement ? "DOCUMENT_REPLACED" : "DOCUMENT_UPLOADED",
          actorId: req.principal!.userId,
          actorName: req.principal!.fullName,
          actorRole: req.principal!.roles[0] ?? null,
          entityType: "document_version",
          entityId: versionId,
          caseId: caseRow.id,
          candidateId: principalCandidateId,
          newValue: {
            documentId,
            requirementId: requirement.id,
            versionNumber,
            originalFilename: file.originalname.slice(0, 255),
            mimeType: stored.mimeType,
            sizeBytes: stored.sizeBytes,
            malwareScanStatus: scan.status,
          },
          ipAddress: req.ipAddress ?? null,
          userAgent: req.userAgent ?? null,
          requestId: req.requestId,
        },
        tx,
      );
    });

    const documents = await listCaseDocuments(caseRow.id);
    const document = documents.find((entry) => entry.id === documentId) ?? null;

    // The assigned verifier is told that a document is waiting for them.
    if (caseRow.assignedVerifierId) {
      await queueNotification({
        event: "DOCUMENT_UPLOADED",
        recipientUserId: caseRow.assignedVerifierId,
        caseId: caseRow.id,
        deduplicationKey: `document-uploaded-${versionId}`,
        variables: {
          caseNumber: caseRow.caseNumber,
          candidateName: profile.fullName,
          documentLabel: requirement.label,
        },
      });
    }

    // A replacement uploaded against an open clarification is a resubmission.
    const openClarifications = await db
      .select({
        id: schema.clarificationRequests.id,
        requestedBy: schema.clarificationRequests.requestedBy,
      })
      .from(schema.clarificationRequests)
      .where(
        and(
          eq(schema.clarificationRequests.caseId, caseRow.id),
          inArray(schema.clarificationRequests.status, ["OPEN", "RESPONDED"]),
        ),
      );

    for (const clarification of openClarifications) {
      if (clarification.requestedBy === req.principal!.userId) continue;
      await queueNotification({
        event: "CLARIFICATION_RESUBMITTED",
        recipientUserId: clarification.requestedBy,
        caseId: caseRow.id,
        deduplicationKey: `clarification-resubmitted-${versionId}-${clarification.id}`,
        variables: {
          candidateName: profile.fullName,
          caseNumber: caseRow.caseNumber,
        },
      });
    }

    res.status(201).json({ data: { document } });
  },
);

/**
 * GET /api/documents/:documentId/versions
 */
documentsRouter.get(
  "/documents/:documentId/versions",
  requirePrincipal,
  validate({ params: documentParams }),
  async (req, res) => {
    const { db } = getDatabase();
    const [document] = await db
      .select()
      .from(schema.documents)
      .where(eq(schema.documents.id, param(req, "documentId")))
      .limit(1);
    if (!document) throw notFound("Document not found");
    await resolveCase(req.principal!, document.caseId);

    const versions = await listDocumentVersions(document.id);
    res.status(200).json({ data: versions });
  },
);

/**
 * GET /api/documents/:documentId/versions/:versionId/download
 *
 * Streams a stored file. The path is never derived from the original
 * filename, and the file is only served after the caller's access to the case
 * has been resolved.
 */
documentsRouter.get(
  "/documents/:documentId/versions/:versionId/download",
  requirePrincipal,
  validate({ params: versionParams }),
  async (req, res) => {
    const { db } = getDatabase();
    const [version] = await db
      .select()
      .from(schema.documentVersions)
      .where(
        and(
          eq(schema.documentVersions.id, param(req, "versionId")),
          eq(schema.documentVersions.documentId, param(req, "documentId")),
        ),
      )
      .limit(1);
    if (!version) throw notFound("Document version not found");

    const [document] = await db
      .select()
      .from(schema.documents)
      .where(eq(schema.documents.id, param(req, "documentId")))
      .limit(1);
    if (!document) throw notFound("Document not found");

    await resolveCase(req.principal!, document.caseId);

    if (!req.principal!.permissions.has("case:read:own" as never)) {
      // Only staff with a verification or profile permission may download a
      // document belonging to a case they are working on.
      if (!req.principal!.permissions.has("verification:read" as never)) {
        throw forbidden("You are not permitted to download this document");
      }
    }

    const { resolveStoragePath } = await import("../../lib/storage.js");
    const filePath = resolveStoragePath(version.storageKey);

    await recordAudit({
      action: "DOCUMENT_DOWNLOADED",
      actorId: req.principal!.userId,
      actorName: req.principal!.fullName,
      actorRole: req.principal!.roles[0] ?? null,
      entityType: "document_version",
      entityId: version.id,
      caseId: document.caseId,
      newValue: { documentId: document.id, versionNumber: version.versionNumber },
      ipAddress: req.ipAddress ?? null,
      userAgent: req.userAgent ?? null,
      requestId: req.requestId,
    });

    res.setHeader("Content-Type", version.mimeType);
    res.setHeader("Content-Length", String(version.sizeBytes));
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(version.originalFilename)}"`,
    );
    res.setHeader("X-Content-Type-Options", "nosniff");
    const { createReadStream } = await import("node:fs");
    const stream = createReadStream(filePath);
    stream.on("error", (err: NodeJS.ErrnoException) => {
      if (!res.headersSent) {
        res.status(err.code === "ENOENT" ? 404 : 500).json({
          error: { code: "NOT_FOUND", message: "Document file is not available on the server." },
        });
      }
    });
    stream.pipe(res);
  },
);

documentsRouter.get(
  "/documents/:documentId/versions/:versionId/view",
  requirePrincipal,
  validate({ params: versionParams }),
  async (req, res) => {
    const { db } = getDatabase();
    const [version] = await db
      .select()
      .from(schema.documentVersions)
      .where(
        and(
          eq(schema.documentVersions.id, param(req, "versionId")),
          eq(schema.documentVersions.documentId, param(req, "documentId")),
        ),
      )
      .limit(1);
    if (!version) throw notFound("Document version not found");

    const [document] = await db
      .select()
      .from(schema.documents)
      .where(eq(schema.documents.id, param(req, "documentId")))
      .limit(1);
    if (!document) throw notFound("Document not found");

    await resolveCase(req.principal!, document.caseId);

    if (!req.principal!.permissions.has("case:read:own" as never)) {
      if (!req.principal!.permissions.has("verification:read" as never)) {
        throw forbidden("You are not permitted to view this document");
      }
    }

    const { resolveStoragePath } = await import("../../lib/storage.js");
    const filePath = resolveStoragePath(version.storageKey);

    await recordAudit({
      action: "DOCUMENT_VIEWED",
      actorId: req.principal!.userId,
      actorName: req.principal!.fullName,
      actorRole: req.principal!.roles[0] ?? null,
      entityType: "document_version",
      entityId: version.id,
      caseId: document.caseId,
      newValue: { documentId: document.id, versionNumber: version.versionNumber },
      ipAddress: req.ipAddress ?? null,
      userAgent: req.userAgent ?? null,
      requestId: req.requestId,
    });

    res.setHeader("Content-Type", version.mimeType);
    res.setHeader("Content-Length", String(version.sizeBytes));
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${encodeURIComponent(version.originalFilename)}"`,
    );
    res.setHeader("X-Content-Type-Options", "nosniff");
    const { createReadStream } = await import("node:fs");
    const stream = createReadStream(filePath);
    stream.on("error", (err: NodeJS.ErrnoException) => {
      if (!res.headersSent) {
        res.status(err.code === "ENOENT" ? 404 : 500).json({
          error: { code: "NOT_FOUND", message: "Document file is not available on the server." },
        });
      }
    });
    stream.pipe(res);
  },
);

/**
 * GET /api/documents/:documentId
 *
 * Reading a document's metadata is a sensitive access and is audited as a
 * document view, alongside the download.
 */
documentsRouter.get(
  "/documents/:documentId",
  requirePrincipal,
  validate({ params: documentParams }),
  async (req, res) => {
    const { db } = getDatabase();
    const [document] = await db
      .select()
      .from(schema.documents)
      .where(eq(schema.documents.id, param(req, "documentId")))
      .limit(1);
    if (!document) throw notFound("Document not found");
    await resolveCase(req.principal!, document.caseId);

    const documents = await listCaseDocuments(document.caseId);
    const payload = documents.find((entry) => entry.id === document.id) ?? null;

    await recordAudit({
      action: "DOCUMENT_VIEWED",
      actorId: req.principal!.userId,
      actorName: req.principal!.fullName,
      actorRole: req.principal!.roles[0] ?? null,
      entityType: "document",
      entityId: document.id,
      caseId: document.caseId,
      newValue: { documentId: document.id, versionCount: document.versionCount },
      ipAddress: req.ipAddress ?? null,
      userAgent: req.userAgent ?? null,
      requestId: req.requestId,
    });

    res.status(200).json({ data: payload });
  },
);

export { requirePermission };
