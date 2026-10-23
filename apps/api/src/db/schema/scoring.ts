import {
  boolean,
  decimal,
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

/**
 * Scoring configuration (versioned) and the append-only score history.
 */

export const scoringConfigurations = mysqlTable(
  "scoring_configurations",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    version: int("version").notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    /** Threshold in percent, e.g. 95.00 */
    threshold: decimal("threshold", { precision: 5, scale: 2 }).notNull(),
    /** When true, a score may be produced with unresolved mandatory checks. */
    allowProvisional: boolean("allow_provisional").notNull().default(false),
    status: varchar("status", { length: 16 }).notNull().default("DRAFT"),
    isApproved: boolean("is_approved").notNull().default(false),
    approvedBy: varchar("approved_by", { length: 36 }).references(() => users.id, {
      onDelete: "set null",
    }),
    approvedAt: timestamp("approved_at", { mode: "date", fsp: 3 }),
    notes: varchar("notes", { length: 2000 }),
    createdAt: timestamp("created_at", { mode: "date", fsp: 3 }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow().onUpdateNow(),
  },
  (t) => [uniqueIndex("uq_scoring_configurations_version").on(t.version)],
);

export const scoringConfigComponents = mysqlTable(
  "scoring_config_components",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    scoringConfigId: varchar("scoring_config_id", { length: 36 }).notNull(),
    /** Check type codes aggregated by this component, e.g. ["EMPLOYMENT","DESIGNATION"]. */
    checkTypeCodes: json("check_type_codes").$type<string[]>().notNull(),
    label: varchar("label", { length: 160 }).notNull(),
    /** Weight in percent. All components of a configuration sum to 100. */
    weight: decimal("weight", { precision: 5, scale: 2 }).notNull(),
    /** Map of check status -> multiplier, e.g. { VERIFIED: 1, PARTIALLY_VERIFIED: 0.5 }. */
    outcomeMultipliers: json("outcome_multipliers").$type<Record<string, number>>().notNull(),
    /** Check statuses excluded from the denominator, e.g. ["WAIVED","NOT_APPLICABLE"]. */
    excludedStatuses: json("excluded_statuses").$type<string[]>().notNull(),
  },
  (t) => [
    foreignKey({
      name: "fk_scoring_component_config",
      columns: [t.scoringConfigId],
      foreignColumns: [scoringConfigurations.id],
    }).onDelete("cascade"),
    index("ix_scoring_config_components_config").on(t.scoringConfigId),
  ],
);

export const bgvScores = mysqlTable(
  "bgv_scores",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    caseId: varchar("case_id", { length: 36 })
      .notNull()
      .references(() => bgvCases.id, { onDelete: "cascade" }),
    scoringConfigId: varchar("scoring_config_id", { length: 36 })
      .notNull()
      .references(() => scoringConfigurations.id, { onDelete: "restrict" }),
    /** Recorded so a score stays explainable after the configuration changes. */
    scoringConfigVersion: int("scoring_config_version").notNull(),
    totalScore: decimal("total_score", { precision: 5, scale: 2 }).notNull(),
    threshold: decimal("threshold", { precision: 5, scale: 2 }).notNull(),
    outcome: varchar("outcome", { length: 24 }).notNull(),
    isProvisional: boolean("is_provisional").notNull().default(false),
    isManualAdjustment: boolean("is_manual_adjustment").notNull().default(false),
    previousScore: decimal("previous_score", { precision: 5, scale: 2 }),
    adjustmentReason: varchar("adjustment_reason", { length: 2000 }),
    adjustedBy: varchar("adjusted_by", { length: 36 }).references(() => users.id, {
      onDelete: "set null",
    }),
    adjustedAt: timestamp("adjusted_at", { mode: "date", fsp: 3 }),
    /** Snapshot of the per-component breakdown used to compute the score. */
    components: json("components").$type<Record<string, unknown>[]>().notNull(),
    generatedBy: varchar("generated_by", { length: 36 }).references(() => users.id, {
      onDelete: "set null",
    }),
    generatedAt: timestamp("generated_at", { mode: "date", fsp: 3 }).notNull().defaultNow(),
    supersededAt: timestamp("superseded_at", { mode: "date" }),
  },
  (t) => [
    index("ix_bgv_scores_case").on(t.caseId, t.generatedAt),
    index("ix_bgv_scores_config_version").on(t.scoringConfigVersion),
  ],
);
