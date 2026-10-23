import { z } from "zod";
import {
  notificationChannelSchema,
  notificationDeliveryStatusSchema,
  notificationEventSchema,
} from "./enums.js";

export const notificationSchema = z.object({
  id: z.string().uuid(),
  event: notificationEventSchema,
  channel: notificationChannelSchema,
  recipientUserId: z.string().uuid(),
  recipientName: z.string().nullable(),
  subject: z.string(),
  body: z.string(),
  caseId: z.string().uuid().nullable(),
  deliveryStatus: notificationDeliveryStatusSchema,
  attemptCount: z.number().int().nonnegative(),
  lastError: z.string().nullable(),
  sentAt: z.string().nullable(),
  createdAt: z.string(),
});
export type Notification = z.infer<typeof notificationSchema>;

export const notificationTemplateSchema = z.object({
  id: z.string().uuid(),
  event: notificationEventSchema,
  channel: notificationChannelSchema,
  name: z.string(),
  subjectTemplate: z.string(),
  bodyTemplate: z.string(),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type NotificationTemplate = z.infer<typeof notificationTemplateSchema>;

export const upsertNotificationTemplateSchema = z.object({
  name: z.string().trim().min(3).max(160),
  subjectTemplate: z.string().trim().min(1).max(500),
  bodyTemplate: z.string().trim().min(1).max(5000),
  isActive: z.boolean().default(true),
});
export type UpsertNotificationTemplateRequest = z.infer<typeof upsertNotificationTemplateSchema>;

export const notificationFiltersSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  event: notificationEventSchema.optional(),
  deliveryStatus: notificationDeliveryStatusSchema.optional(),
  caseId: z.string().uuid().optional(),
});
export type NotificationFilters = z.infer<typeof notificationFiltersSchema>;
