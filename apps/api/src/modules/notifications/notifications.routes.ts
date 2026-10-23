import { Router } from "express";
import { and, asc, count, desc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { notificationFiltersSchema } from "@checkiq/contracts";
import { getDatabase, schema } from "../../db/client.js";
import { requirePermission, requirePrincipal } from "../../middleware/authenticate.js";
import { param } from "../../lib/request.js";
import { validate } from "../../middleware/validate.js";

export const notificationsRouter = Router();

const notificationParams = z.object({ notificationId: z.string().uuid() });

/**
 * GET /api/notifications
 *
 * The signed-in user's notifications.
 */
notificationsRouter.get(
  "/notifications",
  requirePrincipal,
  requirePermission("notification:read:own"),
  validate({ query: notificationFiltersSchema }),
  async (req, res) => {
    const { db } = getDatabase();
    const filters = req.query as unknown as z.infer<typeof notificationFiltersSchema>;

    const conditions = [eq(schema.notifications.recipientUserId, req.principal!.userId)];
    if (filters.event) conditions.push(eq(schema.notifications.event, filters.event));
    if (filters.deliveryStatus) {
      conditions.push(eq(schema.notifications.deliveryStatus, filters.deliveryStatus));
    }
    if (filters.caseId) conditions.push(eq(schema.notifications.caseId, filters.caseId));

    const where = and(...conditions);

    const totalRows = await db
      .select({ value: count() })
      .from(schema.notifications)
      .where(where);

    const rows = await db
      .select({
        id: schema.notifications.id,
        event: schema.notifications.event,
        channel: schema.notifications.channel,
        subject: schema.notifications.subject,
        body: schema.notifications.body,
        caseId: schema.notifications.caseId,
        deliveryStatus: schema.notifications.deliveryStatus,
        attemptCount: schema.notifications.attemptCount,
        lastError: schema.notifications.lastError,
        sentAt: schema.notifications.sentAt,
        readAt: schema.notifications.readAt,
        createdAt: schema.notifications.createdAt,
      })
      .from(schema.notifications)
      .where(where)
      .orderBy(desc(schema.notifications.createdAt))
      .limit(filters.pageSize)
      .offset((filters.page - 1) * filters.pageSize);

    const total = totalRows[0]?.value ?? 0;
    res.status(200).json({
      data: rows.map((row) => ({
        id: row.id,
        event: row.event,
        channel: row.channel,
        recipientUserId: req.principal!.userId,
        recipientName: req.principal!.fullName,
        subject: row.subject,
        body: row.body,
        caseId: row.caseId,
        deliveryStatus: row.deliveryStatus,
        attemptCount: row.attemptCount,
        lastError: row.lastError,
        sentAt: row.sentAt?.toISOString() ?? null,
        readAt: row.readAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
      })),
      meta: {
        page: filters.page,
        pageSize: filters.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / filters.pageSize)),
      },
    });
  },
);

/**
 * POST /api/notifications/:notificationId/read
 */
notificationsRouter.post(
  "/notifications/:notificationId/read",
  requirePrincipal,
  requirePermission("notification:read:own"),
  validate({ params: notificationParams }),
  async (req, res) => {
    const { db } = getDatabase();
    const [row] = await db
      .select({ id: schema.notifications.id })
      .from(schema.notifications)
      .where(
        and(
          eq(schema.notifications.id, param(req, "notificationId")),
          eq(schema.notifications.recipientUserId, req.principal!.userId),
        ),
      )
      .limit(1);
    if (!row) {
      res.status(404).json({
        error: { code: "NOT_FOUND", message: "Notification not found", requestId: req.requestId },
      });
      return;
    }
    await db
      .update(schema.notifications)
      .set({ readAt: new Date() })
      .where(eq(schema.notifications.id, param(req, "notificationId")));
    res.status(200).json({ data: { id: param(req, "notificationId"), read: true } });
  },
);

/**
 * GET /api/notifications/unread-count
 */
notificationsRouter.get(
  "/notifications/unread-count",
  requirePrincipal,
  requirePermission("notification:read:own"),
  async (req, res) => {
    const { db } = getDatabase();
    const rows = await db
      .select({ value: count() })
      .from(schema.notifications)
      .where(
        and(
          eq(schema.notifications.recipientUserId, req.principal!.userId),
          isNull(schema.notifications.readAt),
        ),
      );
    res.status(200).json({ data: { unread: rows[0]?.value ?? 0 } });
  },
);

export { asc, inArray };
