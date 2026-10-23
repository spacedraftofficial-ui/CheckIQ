import {
  boolean,
  date,
  foreignKey,
  timestamp,
  index,
  int,
  json,
  mysqlTable,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";
import { users } from "./identity.js";
import { bgvCases } from "./case.js";
import { checkDefinitions } from "./catalog.js";
import { documents } from "./documents.js";

/**
 * Verification checks, their immutable result history, and clarification
 * threads.
 */

export const verificationChecks = mysqlTable(
  "verification_checks",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    caseId: varchar("case_id", { length: 36 })
      .notNull()
      .references(() => bgvCases.id, { onDelete: "cascade" }),
    checkDefinitionId: varchar("check_definition_id", { length: 36 })
      .notNull()
      .references(() => checkDefinitions.id, { onDelete: "restrict" }),
    label: varchar("label", { length: 160 }).notNull(),
    checkTypeCode: varchar("check_type_code", { length: 48 }).notNull(),
    isMandatory: boolean("is_mandatory").notNull().default(true),
    weight: int("weight").notNull().default(0),
    status: varchar("status", { length: 32 }).notNull().default("NOT_SUBMITTED"),
    outcomeCode: varchar("outcome_code", { length: 64 }),
    verifierId: varchar("verifier_id", { length: 36 }).references(() => users.id, {
      onDelete: "set null",
    }),
    remarks: varchar("remarks", { length: 4000 }),
    evidenceReference: varchar("evidence_reference", { length: 1000 }),
    requiresReview: boolean("requires_review").notNull().default(false),
    startedAt: timestamp("started_at", { mode: "date", fsp: 3 }),
    completedAt: timestamp("completed_at", { mode: "date", fsp: 3 }),
    createdAt: timestamp("created_at", { mode: "date", fsp: 3 }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow().onUpdateNow(),
  },
  (t) => [
    uniqueIndex("uq_verification_checks_case_def").on(t.caseId, t.checkDefinitionId),
    index("ix_verification_checks_status").on(t.status),
    index("ix_verification_checks_verifier").on(t.verifierId),
  ],
);

/** Append-only history of recorded check results. */
export const verificationCheckResults = mysqlTable(
  "verification_check_results",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    checkId: varchar("check_id", { length: 36 })
      .notNull()
      .references(() => verificationChecks.id, { onDelete: "cascade" }),
    sequence: int("sequence").notNull(),
    status: varchar("status", { length: 32 }).notNull(),
    outcomeCode: varchar("outcome_code", { length: 64 }),
    remarks: varchar("remarks", { length: 4000 }),
    evidenceReference: varchar("evidence_reference", { length: 1000 }),
    requiresReview: boolean("requires_review").notNull().default(false),
    recordedBy: varchar("recorded_by", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    recordedAt: timestamp("recorded_at", { mode: "date", fsp: 3 }).notNull().defaultNow(),
    isCurrent: boolean("is_current").notNull().default(true),
  },
  (t) => [
    uniqueIndex("uq_verification_check_results_seq").on(t.checkId, t.sequence),
    index("ix_verification_check_results_check").on(t.checkId),
  ],
);

export const clarificationRequests = mysqlTable(
  "clarification_requests",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    caseId: varchar("case_id", { length: 36 })
      .notNull()
      .references(() => bgvCases.id, { onDelete: "cascade" }),
    checkId: varchar("check_id", { length: 36 }).references(() => verificationChecks.id, {
      onDelete: "set null",
    }),
    documentId: varchar("document_id", { length: 36 }).references(() => documents.id, {
      onDelete: "set null",
    }),
    issueSummary: varchar("issue_summary", { length: 500 }).notNull(),
    requiredAction: varchar("required_action", { length: 2000 }).notNull(),
    remarks: varchar("remarks", { length: 4000 }),
    dueDate: date("due_date", { mode: "string" }),
    status: varchar("status", { length: 16 }).notNull().default("OPEN"),
    requestedBy: varchar("requested_by", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    requestedAt: timestamp("requested_at", { mode: "date", fsp: 3 }).notNull().defaultNow(),
    respondedAt: timestamp("responded_at", { mode: "date", fsp: 3 }),
    responseText: varchar("response_text", { length: 4000 }),
    closedAt: timestamp("closed_at", { mode: "date", fsp: 3 }),
    closedBy: varchar("closed_by", { length: 36 }).references(() => users.id, { onDelete: "set null" }),
    closeReason: varchar("close_reason", { length: 2000 }),
    createdAt: timestamp("created_at", { mode: "date", fsp: 3 }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow().onUpdateNow(),
  },
  (t) => [
    index("ix_clarification_requests_case").on(t.caseId, t.status),
    index("ix_clarification_requests_due").on(t.dueDate),
  ],
);

export const clarificationResponses = mysqlTable(
  "clarification_responses",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    clarificationId: varchar("clarification_id", { length: 36 }).notNull(),
    responseText: varchar("response_text", { length: 4000 }).notNull(),
    attachedDocumentIds: json("attached_document_ids").$type<string[]>().notNull(),
    respondedBy: varchar("responded_by", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    respondedAt: timestamp("responded_at", { mode: "date", fsp: 3 }).notNull().defaultNow(),
    /** True when the response arrived after the requested due date. */
    isLate: boolean("is_late").notNull().default(false),
  },
  (t) => [
    foreignKey({
      name: "fk_clarif_response_clarification",
      columns: [t.clarificationId],
      foreignColumns: [clarificationRequests.id],
    }).onDelete("cascade"),
    index("ix_clarification_responses_clarification").on(t.clarificationId),
  ],
);
