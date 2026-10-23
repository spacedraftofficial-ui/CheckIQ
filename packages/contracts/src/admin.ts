import { z } from "zod";
import { permissionSchema, userRoleSchema } from "./enums.js";
import { paginationQuerySchema } from "./common.js";

export const adminUserSchema = z.object({
  id: z.string().uuid(),
  email: z.email(),
  fullName: z.string(),
  isActive: z.boolean(),
  roles: z.array(userRoleSchema),
  lastLoginAt: z.string().nullable(),
  createdAt: z.string(),
});
export type AdminUser = z.infer<typeof adminUserSchema>;

export const adminUserListSchema = paginationQuerySchema.extend({
  search: z.string().trim().max(120).optional(),
  role: userRoleSchema.optional(),
  isActive: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
});
export type AdminUserListQuery = z.infer<typeof adminUserListSchema>;

export const createStaffUserSchema = z.object({
  email: z.email(),
  fullName: z.string().trim().min(2).max(160),
  roles: z.array(userRoleSchema).min(1),
  temporaryPassword: z.string().min(10).max(128),
});
export type CreateStaffUserRequest = z.infer<typeof createStaffUserSchema>;

export const updateStaffUserSchema = z.object({
  fullName: z.string().trim().min(2).max(160).optional(),
  isActive: z.boolean().optional(),
  roles: z.array(userRoleSchema).min(1).optional(),
  reason: z.string().trim().max(500).optional(),
});
export type UpdateStaffUserRequest = z.infer<typeof updateStaffUserSchema>;

export const roleSchema = z.object({
  code: userRoleSchema,
  name: z.string(),
  description: z.string().nullable(),
  permissions: z.array(permissionSchema),
  isSystem: z.boolean(),
});
export type Role = z.infer<typeof roleSchema>;

export const bgvPackageSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  isActive: z.boolean(),
  requirementCount: z.number().int().nonnegative(),
  checkCount: z.number().int().nonnegative(),
  createdAt: z.string(),
});
export type BgvPackage = z.infer<typeof bgvPackageSchema>;

export const documentCategorySchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  isActive: z.boolean(),
  displayOrder: z.number().int(),
});
export type DocumentCategory = z.infer<typeof documentCategorySchema>;

export const systemConfigSchema = z.object({
  key: z.string(),
  value: z.string(),
  valueType: z.enum(["STRING", "NUMBER", "BOOLEAN", "JSON"]),
  category: z.string(),
  description: z.string().nullable(),
  isSecret: z.boolean(),
  updatedAt: z.string(),
});
export type SystemConfig = z.infer<typeof systemConfigSchema>;

export const updateSystemConfigSchema = z.object({
  value: z.string(),
  reason: z.string().trim().max(500).optional(),
});
export type UpdateSystemConfigRequest = z.infer<typeof updateSystemConfigSchema>;

export const auditEventSchema = z.object({
  id: z.string().uuid(),
  action: z.string(),
  actorId: z.string().uuid().nullable(),
  actorName: z.string().nullable(),
  actorRole: z.string().nullable(),
  entityType: z.string(),
  entityId: z.string().nullable(),
  caseId: z.string().uuid().nullable(),
  candidateId: z.string().nullable(),
  previousValue: z.unknown().nullable(),
  newValue: z.unknown().nullable(),
  reason: z.string().nullable(),
  ipAddress: z.string().nullable(),
  requestId: z.string().nullable(),
  createdAt: z.string(),
});
export type AuditEvent = z.infer<typeof auditEventSchema>;

export const auditFiltersSchema = paginationQuerySchema.extend({
  action: z.string().trim().max(64).optional(),
  actorId: z.string().uuid().optional(),
  entityType: z.string().trim().max(64).optional(),
  entityId: z.string().uuid().optional(),
  caseId: z.string().uuid().optional(),
  candidateId: z.string().trim().max(64).optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
});
export type AuditFilters = z.infer<typeof auditFiltersSchema>;
