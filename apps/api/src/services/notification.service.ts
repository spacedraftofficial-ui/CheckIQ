import type { NotificationEvent } from "@checkiq/contracts";
import { and, eq } from "drizzle-orm";
import { getDatabase, schema } from "../db/client.js";
import { newId } from "../lib/ids.js";
import { getLogger } from "../lib/logger.js";
import { sendEmail } from "./email.service.js";

/**
 * Central notification service.
 *
 * Notifications are queued, rendered from a template and delivered per channel.
 * A delivery failure is recorded against the notification and never rolls back
 * the business transaction that triggered it.
 */

export type TemplateVariables = Record<string, string | number | null | undefined>;

export interface QueueNotificationInput {
  event: NotificationEvent;
  recipientUserId: string;
  recipientEmail?: string | null;
  caseId?: string | null;
  variables: TemplateVariables;
  /** Overrides the default channels for this event. */
  channels?: ("EMAIL" | "IN_APP")[];
  /** Deduplication key. A repeated notification with the same key is skipped. */
  deduplicationKey?: string | null;
}

/** Replaces `{{placeholder}}` tokens in a template. */
export function renderTemplate(template: string, variables: TemplateVariables): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_match, key: string) => {
    const value = variables[key];
    if (value === null || value === undefined) return "";
    return String(value);
  });
}

/** True when the error is a MySQL duplicate-key violation. */
function isDuplicateKey(error: unknown): boolean {
  const candidates: unknown[] = [error];
  let current = error as { cause?: unknown } | undefined;
  for (let depth = 0; depth < 5 && current?.cause; depth += 1) {
    candidates.push(current.cause);
    current = current.cause as { cause?: unknown };
  }
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") continue;
    const value = candidate as { code?: string; errno?: number; message?: string };
    if (value.code === "ER_DUP_ENTRY" || value.errno === 1062) return true;
    if (value.message?.includes("Duplicate entry")) return true;
  }
  return false;
}

export async function queueNotification(input: QueueNotificationInput): Promise<string[]> {
  const { db } = getDatabase();
  const logger = getLogger();

  const templates = await db
    .select()
    .from(schema.notificationTemplates)
    .where(
      and(
        eq(schema.notificationTemplates.event, input.event),
        eq(schema.notificationTemplates.isActive, true),
      ),
    );

  const wanted = input.channels
    ? templates.filter((template) => input.channels!.includes(template.channel as "EMAIL" | "IN_APP"))
    : templates;

  const created: string[] = [];

  for (const template of wanted) {
    const dedupKey =
      input.deduplicationKey === undefined
        ? null
        : `${input.event}:${template.channel}:${input.recipientUserId}:${input.caseId ?? ""}:${input.deduplicationKey}`;

    if (dedupKey) {
      const [existing] = await db
        .select({ id: schema.notifications.id })
        .from(schema.notifications)
        .where(eq(schema.notifications.deduplicationKey, dedupKey))
        .limit(1);
      if (existing) {
        logger.debug({ dedupKey }, "notification already queued");
        continue;
      }
    }

    const subject = renderTemplate(template.subjectTemplate, input.variables);
    const body = renderTemplate(template.bodyTemplate, input.variables);
    const notificationId = newId();

    try {
      await db.insert(schema.notifications).values({
        id: notificationId,
        event: input.event,
        channel: template.channel,
        templateId: template.id,
        recipientUserId: input.recipientUserId,
        caseId: input.caseId ?? null,
        subject,
        body,
        deliveryStatus: "PENDING",
        deduplicationKey: dedupKey,
      });
    } catch (error) {
      if (dedupKey && isDuplicateKey(error)) {
        // A concurrent request already created it.
        logger.debug({ dedupKey }, "notification deduplicated");
        continue;
      }
      throw error;
    }

    created.push(notificationId);

    if (template.channel === "IN_APP") {
      await db
        .update(schema.notifications)
        .set({ deliveryStatus: "SENT", sentAt: new Date() })
        .where(eq(schema.notifications.id, notificationId));
      await recordAttempt(notificationId, 1, "SENT");
      continue;
    }

    // Email channel.
    if (!input.recipientEmail) {
      await db
        .update(schema.notifications)
        .set({ deliveryStatus: "FAILED", lastError: "No email address is available for this recipient" })
        .where(eq(schema.notifications.id, notificationId));
      await recordAttempt(notificationId, 1, "FAILED", "No email address is available for this recipient");
      continue;
    }

    const result = await sendEmail({ to: input.recipientEmail, subject, html: body });
    await db
      .update(schema.notifications)
      .set({
        deliveryStatus: result.delivered ? "SENT" : "FAILED",
        sentAt: result.delivered ? new Date() : null,
        lastError: result.delivered ? null : (result.error ?? "Unknown delivery error"),
        attemptCount: 1,
      })
      .where(eq(schema.notifications.id, notificationId));
    await recordAttempt(notificationId, 1, result.delivered ? "SENT" : "FAILED", result.error);
  }

  return created;
}

async function recordAttempt(
  notificationId: string,
  attemptNumber: number,
  status: string,
  error?: string,
): Promise<void> {
  const { db } = getDatabase();
  await db.insert(schema.notificationDeliveryAttempts).values({
    id: newId(),
    notificationId,
    attemptNumber,
    status,
    error: error?.slice(0, 1000) ?? null,
  });
}

/**
 * Queues a notification for the candidate who owns a profile.
 *
 * Looks up the account behind the profile so that callers do not have to
 * resolve it themselves, and so that a candidate who has lost access to their
 * registered email still receives the in-app notification.
 */
export async function notifyCandidate(
  profileId: string,
  event: NotificationEvent,
  variables: TemplateVariables,
  options: { caseId?: string | null; deduplicationKey?: string | null; channels?: ("EMAIL" | "IN_APP")[] } = {},
): Promise<string[]> {
  const { db } = getDatabase();
  const [profile] = await db
    .select({
      userId: schema.candidateProfiles.userId,
      email: schema.candidateProfiles.email,
      fullName: schema.candidateProfiles.fullName,
      candidateId: schema.candidateProfiles.candidateId,
    })
    .from(schema.candidateProfiles)
    .where(eq(schema.candidateProfiles.id, profileId))
    .limit(1);

  if (!profile) return [];

  return queueNotification({
    event,
    recipientUserId: profile.userId,
    recipientEmail: profile.email,
    caseId: options.caseId ?? null,
    deduplicationKey: options.deduplicationKey ?? null,
    channels: options.channels,
    variables: {
      candidateName: profile.fullName,
      candidateId: profile.candidateId,
      ...variables,
    },
  });
}

/**
 * Retries failed notifications. Failures never undo the business transaction
 * that produced them, so retries are a separate, safe operation.
 */
export async function retryFailedNotifications(limit = 50): Promise<number> {
  const { db } = getDatabase();
  const failed = await db
    .select()
    .from(schema.notifications)
    .where(eq(schema.notifications.deliveryStatus, "FAILED"))
    .limit(limit);

  let retried = 0;
  for (const notification of failed) {
    if (notification.channel !== "EMAIL") continue;
    const [recipient] = await db
      .select({ email: schema.users.email })
      .from(schema.users)
      .where(eq(schema.users.id, notification.recipientUserId))
      .limit(1);
    if (!recipient) continue;

    const attemptNumber = notification.attemptCount + 1;
    const result = await sendEmail({
      to: recipient.email,
      subject: notification.subject,
      html: notification.body,
    });
    await db
      .update(schema.notifications)
      .set({
        deliveryStatus: result.delivered ? "SENT" : "FAILED",
        sentAt: result.delivered ? new Date() : null,
        lastError: result.delivered ? null : (result.error ?? "Unknown delivery error"),
        attemptCount: attemptNumber,
      })
      .where(eq(schema.notifications.id, notification.id));
    await recordAttempt(
      notification.id,
      attemptNumber,
      result.delivered ? "SENT" : "FAILED",
      result.error,
    );
    if (result.delivered) retried += 1;
  }
  return retried;
}
