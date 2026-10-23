import {
  boolean,
  timestamp,
  index,
  int,
  mysqlTable,
  text,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";
import { users } from "./identity.js";
import { bgvCases } from "./case.js";
import { candidateProfiles } from "./candidate.js";

/**
 * Maker-checker reviews, final approvals, and consent/declaration versioning.
 */

export const reviews = mysqlTable(
  "reviews",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    caseId: varchar("case_id", { length: 36 })
      .notNull()
      .references(() => bgvCases.id, { onDelete: "cascade" }),
    round: int("round").notNull(),
    status: varchar("status", { length: 32 }).notNull().default("PENDING"),
    reviewerId: varchar("reviewer_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    reviewerRole: varchar("reviewer_role", { length: 32 }),
    decision: varchar("decision", { length: 32 }),
    remarks: varchar("remarks", { length: 4000 }),
    returnReason: varchar("return_reason", { length: 2000 }),
    /** False when the reviewer also recorded the deciding verification result. */
    isMakerCheckerSatisfied: boolean("is_maker_checker_satisfied").notNull().default(false),
    createdAt: timestamp("created_at", { mode: "date", fsp: 3 }).notNull().defaultNow(),
    decidedAt: timestamp("decided_at", { mode: "date", fsp: 3 }),
  },
  (t) => [
    uniqueIndex("uq_reviews_case_round").on(t.caseId, t.round),
    index("ix_reviews_reviewer").on(t.reviewerId),
  ],
);

export const approvals = mysqlTable(
  "approvals",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    caseId: varchar("case_id", { length: 36 })
      .notNull()
      .references(() => bgvCases.id, { onDelete: "cascade" }),
    approvedBy: varchar("approved_by", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    approvedByRole: varchar("approved_by_role", { length: 32 }),
    decision: varchar("decision", { length: 32 }).notNull(),
    remarks: varchar("remarks", { length: 4000 }),
    scoreAtApproval: varchar("score_at_approval", { length: 16 }),
    createdAt: timestamp("created_at", { mode: "date", fsp: 3 }).notNull().defaultNow(),
  },
  (t) => [index("ix_approvals_case").on(t.caseId)],
);

export const consentVersions = mysqlTable(
  "consent_versions",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    version: varchar("version", { length: 32 }).notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    body: text("body").notNull(),
    effectiveFrom: timestamp("effective_from", { mode: "date", fsp: 3 }).notNull().defaultNow(),
    isActive: boolean("is_active").notNull().default(true),
    createdBy: varchar("created_by", { length: 36 }).references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { mode: "date", fsp: 3 }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("uq_consent_versions_version").on(t.version)],
);

export const consentAcceptances = mysqlTable(
  "consent_acceptances",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    consentVersionId: varchar("consent_version_id", { length: 36 })
      .notNull()
      .references(() => consentVersions.id, { onDelete: "restrict" }),
    version: varchar("version", { length: 32 }).notNull(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    profileId: varchar("profile_id", { length: 36 }).references(() => candidateProfiles.id, {
      onDelete: "restrict",
    }),
    candidateId: varchar("candidate_id", { length: 64 }).notNull(),
    acceptedAt: timestamp("accepted_at", { mode: "date", fsp: 3 }).notNull().defaultNow(),
    ipAddress: varchar("ip_address", { length: 64 }),
    userAgent: varchar("user_agent", { length: 300 }),
  },
  (t) => [
    index("ix_consent_acceptances_profile").on(t.profileId),
    index("ix_consent_acceptances_version").on(t.consentVersionId),
  ],
);
