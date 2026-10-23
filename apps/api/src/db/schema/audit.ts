import {
  boolean,
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
 * Append-only audit trail and system configuration.
 *
 * There is deliberately no update or delete path for `audit_events`. The API
 * exposes read-only routes for it, and the only write path is the audit
 * writer used by the application itself.
 */

export const auditEvents = mysqlTable(
  "audit_events",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    action: varchar("action", { length: 64 }).notNull(),
    actorId: varchar("actor_id", { length: 36 }).references(() => users.id, {
      onDelete: "set null",
    }),
    /** Denormalised so the trail survives account deletion. */
    actorName: varchar("actor_name", { length: 160 }),
    actorRole: varchar("actor_role", { length: 32 }),
    entityType: varchar("entity_type", { length: 64 }).notNull(),
    entityId: varchar("entity_id", { length: 36 }),
    caseId: varchar("case_id", { length: 36 }).references(() => bgvCases.id, { onDelete: "set null" }),
    candidateId: varchar("candidate_id", { length: 64 }),
    previousValue: json("previous_value").$type<unknown>(),
    newValue: json("new_value").$type<unknown>(),
    reason: varchar("reason", { length: 2000 }),
    ipAddress: varchar("ip_address", { length: 64 }),
    userAgent: varchar("user_agent", { length: 300 }),
    requestId: varchar("request_id", { length: 64 }),
    createdAt: timestamp("created_at", { mode: "date", fsp: 3 }).notNull().defaultNow(),
  },
  (t) => [
    index("ix_audit_events_action").on(t.action),
    index("ix_audit_events_actor").on(t.actorId),
    index("ix_audit_events_entity").on(t.entityType, t.entityId),
    index("ix_audit_events_case").on(t.caseId, t.createdAt),
    index("ix_audit_events_candidate").on(t.candidateId, t.createdAt),
    index("ix_audit_events_created").on(t.createdAt),
  ],
);

export const systemConfig = mysqlTable(  "system_config",
  {
    key: varchar("key", { length: 96 }).primaryKey(),
    value: varchar("value", { length: 4000 }).notNull(),
    valueType: varchar("value_type", { length: 16 }).notNull().default("STRING"),
    category: varchar("category", { length: 48 }).notNull().default("GENERAL"),
    description: varchar("description", { length: 500 }),
    /** Secrets are never returned through the configuration API. */
    isSecret: boolean("is_secret").notNull().default(false),
    updatedBy: varchar("updated_by", { length: 36 }).references(() => users.id, {
      onDelete: "set null",
    }),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow().onUpdateNow(),
  },
  (t) => [uniqueIndex("uq_system_config_key").on(t.key), index("ix_system_config_category").on(t.category)],
);

/**
 * Monotonic counters used to build human-readable, collision-free references
 * such as case numbers. Incremented with `LAST_INSERT_ID(value + 1)` so that
 * concurrent requests cannot receive the same value.
 */
export const sequences = mysqlTable("sequences", {
  name: varchar("name", { length: 48 }).primaryKey(),
  value: int("value").notNull().default(0),
});
