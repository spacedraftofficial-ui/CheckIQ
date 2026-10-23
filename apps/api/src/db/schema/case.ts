import {
  boolean,
  timestamp,
  decimal,
  index,
  int,
  json,
  mysqlTable,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";
import { users } from "./identity.js";
import { candidateProfiles } from "./candidate.js";
import { bgvPackages } from "./catalog.js";

/**
 * BGV cases, their status history, assignments and submission events.
 */

export const bgvCases = mysqlTable(
  "bgv_cases",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    caseNumber: varchar("case_number", { length: 32 }).notNull(),
    profileId: varchar("profile_id", { length: 36 })
      .notNull()
      .references(() => candidateProfiles.id, { onDelete: "restrict" }),
    packageId: varchar("package_id", { length: 36 })
      .notNull()
      .references(() => bgvPackages.id, { onDelete: "restrict" }),
    status: varchar("status", { length: 40 }).notNull().default("DRAFT"),
    assignedVerifierId: varchar("assigned_verifier_id", { length: 36 }).references(() => users.id, {
      onDelete: "set null",
    }),
    assignedReviewerId: varchar("assigned_reviewer_id", { length: 36 }).references(() => users.id, {
      onDelete: "set null",
    }),
    company: varchar("company", { length: 160 }),
    department: varchar("department", { length: 160 }),
    position: varchar("position", { length: 160 }),
    /** Latest score. The full history lives in `bgv_scores`. */
    score: decimal("score", { precision: 5, scale: 2 }),
    scoreOutcome: varchar("score_outcome", { length: 32 }),
    eligibilityResult: varchar("eligibility_result", { length: 40 }),
    legalHold: boolean("legal_hold").notNull().default(false),
    /** Optimistic concurrency token. Incremented on every mutation. */
    version: int("version").notNull().default(1),
    initiatedAt: timestamp("initiated_at", { mode: "date", fsp: 3 }),
    submittedAt: timestamp("submitted_at", { mode: "date", fsp: 3 }),
    verificationStartedAt: timestamp("verification_started_at", { mode: "date", fsp: 3 }),
    verificationCompletedAt: timestamp("verification_completed_at", { mode: "date", fsp: 3 }),
    closedAt: timestamp("closed_at", { mode: "date", fsp: 3 }),
    createdAt: timestamp("created_at", { mode: "date", fsp: 3 }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow().onUpdateNow(),
  },
  (t) => [
    uniqueIndex("uq_bgv_cases_number").on(t.caseNumber),
    index("ix_bgv_cases_profile").on(t.profileId),
    index("ix_bgv_cases_status").on(t.status),
    index("ix_bgv_cases_verifier").on(t.assignedVerifierId),
    index("ix_bgv_cases_reviewer").on(t.assignedReviewerId),
    index("ix_bgv_cases_submitted_at").on(t.submittedAt),
    index("ix_bgv_cases_queue").on(t.status, t.assignedVerifierId),
  ],
);

export const caseStatusHistory = mysqlTable(
  "case_status_history",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    caseId: varchar("case_id", { length: 36 })
      .notNull()
      .references(() => bgvCases.id, { onDelete: "cascade" }),
    fromStatus: varchar("from_status", { length: 40 }),
    toStatus: varchar("to_status", { length: 40 }).notNull(),
    actorId: varchar("actor_id", { length: 36 }).references(() => users.id, { onDelete: "set null" }),
    actorRole: varchar("actor_role", { length: 32 }),
    reason: varchar("reason", { length: 2000 }),
    metadata: json("metadata").$type<Record<string, unknown> | null>(),
    createdAt: timestamp("created_at", { mode: "date", fsp: 3 }).notNull().defaultNow(),
  },
  (t) => [index("ix_case_status_history_case").on(t.caseId, t.createdAt)],
);

export const caseAssignments = mysqlTable(
  "case_assignments",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    caseId: varchar("case_id", { length: 36 })
      .notNull()
      .references(() => bgvCases.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    assignmentRole: varchar("assignment_role", { length: 24 }).notNull(),
    assignedBy: varchar("assigned_by", { length: 36 }).references(() => users.id, {
      onDelete: "set null",
    }),
    assignedAt: timestamp("assigned_at", { mode: "date", fsp: 3 }).notNull().defaultNow(),
    unassignedAt: timestamp("unassigned_at", { mode: "date" }),
    reason: varchar("reason", { length: 1000 }),
  },
  (t) => [
    index("ix_case_assignments_case").on(t.caseId),
    index("ix_case_assignments_user").on(t.userId),
  ],
);

/**
 * One effective submission per case. `idempotencyKey` makes a retried request
 * a no-op rather than a second submission.
 */
export const bgvSubmissionEvents = mysqlTable(
  "bgv_submission_events",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    caseId: varchar("case_id", { length: 36 })
      .notNull()
      .references(() => bgvCases.id, { onDelete: "cascade" }),
    idempotencyKey: varchar("idempotency_key", { length: 100 }).notNull(),
    submittedBy: varchar("submitted_by", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    submittedAt: timestamp("submitted_at", { mode: "date", fsp: 3 }).notNull().defaultNow(),
    /** Snapshot of the readiness evaluation at submission time. */
    readinessSnapshot: json("readiness_snapshot").$type<Record<string, unknown> | null>(),
  },
  (t) => [
    uniqueIndex("uq_submission_case").on(t.caseId),
    uniqueIndex("uq_submission_case_key").on(t.caseId, t.idempotencyKey),
  ],
);
