import {
  boolean,
  foreignKey,
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

/**
 * Notification templates, notifications and per-channel delivery attempts.
 */

export const notificationTemplates = mysqlTable(
  "notification_templates",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    event: varchar("event", { length: 48 }).notNull(),
    channel: varchar("channel", { length: 16 }).notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    subjectTemplate: varchar("subject_template", { length: 500 }).notNull(),
    bodyTemplate: text("body_template").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { mode: "date", fsp: 3 }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow().onUpdateNow(),
  },
  (t) => [uniqueIndex("uq_notification_templates_event_channel").on(t.event, t.channel)],
);

export const notifications = mysqlTable(
  "notifications",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    event: varchar("event", { length: 48 }).notNull(),
    channel: varchar("channel", { length: 16 }).notNull(),
    templateId: varchar("template_id", { length: 36 }).references(() => notificationTemplates.id, {
      onDelete: "set null",
    }),
    recipientUserId: varchar("recipient_user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    caseId: varchar("case_id", { length: 36 }).references(() => bgvCases.id, { onDelete: "cascade" }),
    subject: varchar("subject", { length: 500 }).notNull(),
    body: text("body").notNull(),
    deliveryStatus: varchar("delivery_status", { length: 16 }).notNull().default("PENDING"),
    attemptCount: int("attempt_count").notNull().default(0),
    lastError: varchar("last_error", { length: 1000 }),
    sentAt: timestamp("sent_at", { mode: "date", fsp: 3 }),
    readAt: timestamp("read_at", { mode: "date", fsp: 3 }),
    /** Set when the same event+recipient+case is queued again; prevents duplicates. */
    deduplicationKey: varchar("deduplication_key", { length: 255 }),
    createdAt: timestamp("created_at", { mode: "date", fsp: 3 }).notNull().defaultNow(),
  },
  (t) => [
    index("ix_notifications_recipient").on(t.recipientUserId, t.createdAt),
    index("ix_notifications_case").on(t.caseId),
    index("ix_notifications_status").on(t.deliveryStatus),
    uniqueIndex("uq_notifications_dedup").on(t.deduplicationKey),
  ],
);

export const notificationDeliveryAttempts = mysqlTable(
  "notification_delivery_attempts",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    notificationId: varchar("notification_id", { length: 36 }).notNull(),
    attemptNumber: int("attempt_number").notNull(),
    status: varchar("status", { length: 16 }).notNull(),
    error: varchar("error", { length: 1000 }),
    providerResponse: varchar("provider_response", { length: 1000 }),
    attemptedAt: timestamp("attempted_at", { mode: "date", fsp: 3 }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "fk_delivery_attempt_notification",
      columns: [t.notificationId],
      foreignColumns: [notifications.id],
    }).onDelete("cascade"),
    index("ix_notification_attempts_notification").on(t.notificationId),
  ],
);
