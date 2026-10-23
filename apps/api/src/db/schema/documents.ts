import {
  boolean,
  timestamp,
  index,
  int,
  mysqlTable,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";
import { users } from "./identity.js";
import { bgvCases } from "./case.js";
import { candidateProfiles } from "./candidate.js";
import { documentRequirements, documentTypes } from "./catalog.js";

/**
 * Documents and their versions.
 *
 * `documents` is the logical document (one per package requirement on a
 * case). `document_versions` is the append-only upload history — replacing a
 * document creates a new version and supersedes the previous one.
 */

export const documents = mysqlTable(
  "documents",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    caseId: varchar("case_id", { length: 36 })
      .notNull()
      .references(() => bgvCases.id, { onDelete: "cascade" }),
    profileId: varchar("profile_id", { length: 36 })
      .notNull()
      .references(() => candidateProfiles.id, { onDelete: "restrict" }),
    requirementId: varchar("requirement_id", { length: 36 })
      .notNull()
      .references(() => documentRequirements.id, { onDelete: "cascade" }),
    documentTypeId: varchar("document_type_id", { length: 36 })
      .notNull()
      .references(() => documentTypes.id, { onDelete: "restrict" }),
    label: varchar("label", { length: 160 }).notNull(),
    status: varchar("status", { length: 32 }).notNull().default("MISSING"),
    currentVersionId: varchar("current_version_id", { length: 36 }),
    assignedVerifierId: varchar("assigned_verifier_id", { length: 36 }).references(() => users.id, {
      onDelete: "set null",
    }),
    verifiedAt: timestamp("verified_at", { mode: "date", fsp: 3 }),
    reviewerRemarks: varchar("reviewer_remarks", { length: 2000 }),
    evidenceReference: varchar("evidence_reference", { length: 500 }),
    versionCount: int("version_count").notNull().default(0),
    createdAt: timestamp("created_at", { mode: "date", fsp: 3 }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow().onUpdateNow(),
  },
  (t) => [
    uniqueIndex("uq_documents_case_requirement").on(t.caseId, t.requirementId),
    index("ix_documents_case").on(t.caseId),
    index("ix_documents_status").on(t.status),
    index("ix_documents_verifier").on(t.assignedVerifierId),
  ],
);

export const documentVersions = mysqlTable(
  "document_versions",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    documentId: varchar("document_id", { length: 36 })
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    versionNumber: int("version_number").notNull(),
    /**
     * Opaque storage key. Never derived from the original filename, never
     * guessable, never served from a public path.
     */
    storageKey: varchar("storage_key", { length: 255 }).notNull(),
    originalFilename: varchar("original_filename", { length: 255 }).notNull(),
    mimeType: varchar("mime_type", { length: 120 }).notNull(),
    sizeBytes: int("size_bytes").notNull(),
    checksumSha256: varchar("checksum_sha256", { length: 64 }).notNull(),
    malwareScanStatus: varchar("malware_scan_status", { length: 16 }).notNull().default("PENDING"),
    malwareScanDetail: varchar("malware_scan_detail", { length: 500 }),
    uploadedBy: varchar("uploaded_by", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    uploadedAt: timestamp("uploaded_at", { mode: "date", fsp: 3 }).notNull().defaultNow(),
    isCurrent: boolean("is_current").notNull().default(true),
    supersededAt: timestamp("superseded_at", { mode: "date" }),
  },
  (t) => [
    uniqueIndex("uq_document_versions_number").on(t.documentId, t.versionNumber),
    uniqueIndex("uq_document_versions_storage_key").on(t.storageKey),
    index("ix_document_versions_document").on(t.documentId),
    index("ix_document_versions_uploaded_by").on(t.uploadedBy),
  ],
);
