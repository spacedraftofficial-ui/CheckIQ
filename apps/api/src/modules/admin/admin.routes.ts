import { Router } from "express";
import { hash } from "@node-rs/argon2";
import { and, asc, count, desc, eq, gte, isNull, like, lte, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import {
  adminUserListSchema,
  auditFiltersSchema,
  createScoringConfigSchema,
  createStaffUserSchema,
  updateStaffUserSchema,
  updateSystemConfigSchema,
  upsertNotificationTemplateSchema,
} from "@checkiq/contracts";
import { getDatabase, schema } from "../../db/client.js";
import { body, param } from "../../lib/request.js";
import { requirePermission, requirePrincipal } from "../../middleware/authenticate.js";
import { validate } from "../../middleware/validate.js";
import { conflict, forbidden, notFound, validationError } from "../../lib/errors.js";
import { newId } from "../../lib/ids.js";
import { recordAudit } from "../../services/audit.service.js";
import { queueNotification } from "../../services/notification.service.js";
import { clearConfigCache } from "../../services/config.service.js";
import { USER_ROLES } from "@checkiq/contracts";

export const adminRouter = Router();

const idParam = z.object({ id: z.string().uuid() });
const deleteUserBody = z.object({ reason: z.string().trim().max(1000).optional() }).strict().default({});
const configParam = z.object({ key: z.string().min(1).max(96) });
const templateParam = z.object({
  event: z.string().min(1).max(48),
  channel: z.enum(["EMAIL", "IN_APP"]),
});

/**
 * GET /api/admin/users
 */
adminRouter.get(
  "/admin/users",
  requirePrincipal,
  requirePermission("user:manage", "role:manage"),
  validate({ query: adminUserListSchema }),
  async (req, res) => {
    const { db } = getDatabase();
    const filters = req.query as unknown as z.infer<typeof adminUserListSchema>;

    const conditions: SQL[] = [];
    if (filters.search) {
      const term = `%${filters.search}%`;
      conditions.push(
        or(
          eq(schema.users.emailNormalized, filters.search.toLowerCase()),
          like(schema.users.fullName, term),
        )!,
      );
    }
    if (filters.isActive !== undefined) {
      conditions.push(eq(schema.users.isActive, filters.isActive));
    }
    if (filters.isDeleted !== undefined) {
      if (filters.isDeleted) {
        conditions.push(sql`deleted_at IS NOT NULL`);
      } else {
        conditions.push(isNull(schema.users.deletedAt));
      }
    }
    if (filters.role) {
      conditions.push(
        eq(
          schema.users.id,
          sql`(
            SELECT \`ur\`.\`user_id\` FROM \`user_roles\` \`ur\`
             WHERE \`ur\`.\`role_code\` = ${filters.role}
               AND \`ur\`.\`revoked_at\` IS NULL
          )`,
        ),
      );
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const totalRows = await db
      .select({ value: count() })
      .from(schema.users)
      .where(where);

    const rows = await db
      .select({
        id: schema.users.id,
        email: schema.users.email,
        fullName: schema.users.fullName,
        isActive: schema.users.isActive,
        isEmailVerified: schema.users.isEmailVerified,
        deletedAt: schema.users.deletedAt,
        lastLoginAt: schema.users.lastLoginAt,
        createdAt: schema.users.createdAt,
      })
      .from(schema.users)
      .where(where)
      .orderBy(asc(schema.users.fullName))
      .limit(filters.pageSize)
      .offset((filters.page - 1) * filters.pageSize);

    const roleRows = await db
      .select({ userId: schema.userRoles.userId, code: schema.userRoles.roleCode })
      .from(schema.userRoles)
      .where(isNull(schema.userRoles.revokedAt));

    const total = totalRows[0]?.value ?? 0;
    res.status(200).json({
      data: rows.map((row) => ({
        id: row.id,
        email: row.email,
        fullName: row.fullName,
        isActive: row.isActive,
        isEmailVerified: row.isEmailVerified,
        deletedAt: row.deletedAt?.toISOString() ?? null,
        roles: roleRows
          .filter((role) => role.userId === row.id)
          .map((role) => role.code as (typeof USER_ROLES)[number]),
        lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
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
 * GET /api/admin/users/:id
 *
 * Returns a user's full profile including their roles, email verification status,
 * account lockout state, and associated audit events. The audit trail is
 * append-only and filtered to actions involving this user.
 */
adminRouter.get(
  "/admin/users/:id",
  requirePrincipal,
  requirePermission("user:manage"),
  validate({ params: idParam }),
  async (req, res) => {
    const { db } = getDatabase();
    const userId = param(req, "id");

    const [user] = await db
      .select({
        id: schema.users.id,
        email: schema.users.email,
        emailNormalized: schema.users.emailNormalized,
        fullName: schema.users.fullName,
        mobile: schema.users.mobile,
        isActive: schema.users.isActive,
        isEmailVerified: schema.users.isEmailVerified,
        mustChangePassword: schema.users.mustChangePassword,
        failedLoginAttempts: schema.users.failedLoginAttempts,
        lockedUntil: schema.users.lockedUntil,
        lastLoginAt: schema.users.lastLoginAt,
        createdAt: schema.users.createdAt,
        updatedAt: schema.users.updatedAt,
        deletedAt: schema.users.deletedAt,
      })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);

    if (!user) throw notFound("User not found");

    const activeRoles = await db
      .select({ code: schema.userRoles.roleCode, assignedAt: schema.userRoles.assignedAt })
      .from(schema.userRoles)
      .where(
        and(
          eq(schema.userRoles.userId, user.id),
          isNull(schema.userRoles.revokedAt),
        ),
      );

    const revokedRoles = await db
      .select({
        code: schema.userRoles.roleCode,
        revokedAt: schema.userRoles.revokedAt,
      })
      .from(schema.userRoles)
      .where(
        and(
          eq(schema.userRoles.userId, user.id),
          sql`revoked_at IS NOT NULL`,
        ),
      );

    const associatedCases = await db
      .select({
        id: schema.bgvCases.id,
        caseNumber: schema.bgvCases.caseNumber,
        status: schema.bgvCases.status,
        submittedAt: schema.bgvCases.submittedAt,
        createdAt: schema.bgvCases.createdAt,
      })
      .from(schema.bgvCases)
      .innerJoin(
        schema.candidateProfiles,
        eq(schema.candidateProfiles.userId, user.id),
      )
      .where(eq(schema.bgvCases.profileId, schema.candidateProfiles.id))
      .orderBy(desc(schema.bgvCases.createdAt))
      .limit(50);

    const auditRows = await db
      .select()
      .from(schema.auditEvents)
      .where(
        or(
          eq(schema.auditEvents.actorId, user.id),
          eq(schema.auditEvents.entityId, user.id),
        ),
      )
      .orderBy(desc(schema.auditEvents.createdAt))
      .limit(100);

    res.status(200).json({
      data: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        mobile: user.mobile,
        isActive: user.isActive,
        isEmailVerified: user.isEmailVerified,
        mustChangePassword: user.mustChangePassword,
        failedLoginAttempts: user.failedLoginAttempts,
        lockedUntil: user.lockedUntil?.toISOString() ?? null,
        lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
        deletedAt: user.deletedAt?.toISOString() ?? null,
        roles: activeRoles.map((row) => row.code as (typeof USER_ROLES)[number]),
        revokedRoles: revokedRoles.map((row) => ({
          code: row.code as (typeof USER_ROLES)[number],
          revokedAt: row.revokedAt!.toISOString(),
        })),
        associatedCases: associatedCases.map((row) => ({
          id: row.id,
          caseNumber: row.caseNumber,
          status: row.status,
          submittedAt: row.submittedAt?.toISOString() ?? null,
          createdAt: row.createdAt.toISOString(),
        })),
        auditTrail: auditRows.map((row) => ({
          id: row.id,
          action: row.action,
          actorId: row.actorId,
          actorName: row.actorName,
          actorRole: row.actorRole,
          entityType: row.entityType,
          entityId: row.entityId,
          caseId: row.caseId,
          candidateId: row.candidateId,
          previousValue: row.previousValue,
          newValue: row.newValue,
          reason: row.reason,
          ipAddress: row.ipAddress,
          requestId: row.requestId,
          createdAt: row.createdAt.toISOString(),
        })),
      },
    });
  },
);

/**
 * POST /api/admin/users
 */
adminRouter.post(
  "/admin/users",
  requirePrincipal,
  requirePermission("user:manage"),
  validate({ body: createStaffUserSchema }),
  async (req, res) => {
    const payload = body<z.infer<typeof createStaffUserSchema>>(req);
    const { db } = getDatabase();
    const emailNormalized = req.body.email.trim().toLowerCase();

    const [existing] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.emailNormalized, emailNormalized))
      .limit(1);
    if (existing) throw conflict("An account already exists for this email address");

    const passwordHash = await hash(req.body.temporaryPassword);
    const userId = newId();

    await db.transaction(async (tx) => {
      await tx.insert(schema.users).values({
        id: userId,
        email: req.body.email.trim(),
        emailNormalized,
        passwordHash,
        fullName: req.body.fullName.trim(),
        mobile: "+00000000000",
        mustChangePassword: true,
      });

      await tx.insert(schema.userRoles).values(
        payload.roles.map((role) => ({
          userId,
          roleCode: role,
          assignedBy: req.principal!.userId,
        })),
      );

      await recordAudit(
        {
          action: "USER_CREATED",
          actorId: req.principal!.userId,
          actorName: req.principal!.fullName,
          actorRole: req.principal!.roles[0] ?? null,
          entityType: "user",
          entityId: userId,
          newValue: { email: emailNormalized, roles: payload.roles },
          ipAddress: req.ipAddress ?? null,
          userAgent: req.userAgent ?? null,
          requestId: req.requestId,
        },
        tx,
      );
    });

    res.status(201).json({ data: { id: userId, created: true } });
  },
);

/**
 * PATCH /api/admin/users/:id
 *
 * Updates a staff account. Role and permission changes are audited with the
 * previous and new values.
 */
adminRouter.patch(
  "/admin/users/:id",
  requirePrincipal,
  requirePermission("user:manage", "permission:manage"),
  validate({ params: idParam, body: updateStaffUserSchema }),
  async (req, res) => {
    const payload = body<z.infer<typeof updateStaffUserSchema>>(req);
    const { db } = getDatabase();
    const [existing] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, param(req, "id")))
      .limit(1);
    if (!existing) throw notFound("User not found");

    // A deleted (soft-deleted) account cannot be reactivated here.
    if (existing.deletedAt && req.body.isActive === true) {
      throw forbidden("Deleted accounts cannot be reactivated. Undelete by clearing the deleted_at column.");
    }

    const currentRoles = await db
      .select({ code: schema.userRoles.roleCode })
      .from(schema.userRoles)
      .where(eq(schema.userRoles.userId, existing.id));

    await db.transaction(async (tx) => {
      const patch: Partial<typeof schema.users.$inferInsert> = {};
      if (req.body.fullName !== undefined) patch.fullName = req.body.fullName;
      if (req.body.isActive !== undefined) {
        patch.isActive = req.body.isActive;
        // Deactivating an account invalidates its outstanding sessions.
        if (!req.body.isActive) patch.sessionEpoch = existing.sessionEpoch + 1;
      }
      if (Object.keys(patch).length > 0) {
        await tx.update(schema.users).set(patch).where(eq(schema.users.id, existing.id));
      }

      if (payload.roles) {
        const next = new Set<string>(payload.roles);
        const current = new Set<string>(currentRoles.map((role) => role.code));
        const toAdd = [...next].filter((role) => !current.has(role));
        const toRemove = [...current].filter((role) => !next.has(role));

        for (const role of toAdd) {
          await tx.insert(schema.userRoles).values({
            userId: existing.id,
            roleCode: role,
            assignedBy: req.principal!.userId,
          });
        }
        for (const role of toRemove) {
          await tx
            .update(schema.userRoles)
            .set({ revokedAt: new Date() })
            .where(
              and(
                eq(schema.userRoles.userId, existing.id),
                eq(schema.userRoles.roleCode, role),
              ),
            );
        }

        await recordAudit(
          {
            action: "USER_ROLE_CHANGED",
            actorId: req.principal!.userId,
            actorName: req.principal!.fullName,
            actorRole: req.principal!.roles[0] ?? null,
            entityType: "user",
            entityId: existing.id,
            previousValue: { roles: [...current] },
            newValue: { roles: [...next] },
            reason: req.body.reason ?? null,
            ipAddress: req.ipAddress ?? null,
            userAgent: req.userAgent ?? null,
            requestId: req.requestId,
          },
          tx,
        );

        // The affected user is told that their access changed.
        await queueNotification({
          event: "ADMIN_NOTICE",
          recipientUserId: existing.id,
          recipientEmail: existing.email,
          deduplicationKey: `role-changed-${existing.id}-${new Date().toISOString()}`,
          variables: {
            candidateName: existing.fullName,
            caseNumber: "",
            reason:
              req.body.reason ??
              `Your roles changed from ${[...current].join(", ") || "none"} to ${[...next].join(", ")}.`,
          },
        });
      }

      if (req.body.isActive !== undefined) {
        await recordAudit(
          {
            action: req.body.isActive ? "USER_UPDATED" : "USER_DISABLED",
            actorId: req.principal!.userId,
            actorName: req.principal!.fullName,
            actorRole: req.principal!.roles[0] ?? null,
            entityType: "user",
            entityId: existing.id,
            previousValue: { isActive: existing.isActive },
            newValue: { isActive: req.body.isActive },
            reason: req.body.reason ?? null,
            ipAddress: req.ipAddress ?? null,
            userAgent: req.userAgent ?? null,
            requestId: req.requestId,
          },
          tx,
        );
      }
    });

    res.status(200).json({ data: { id: existing.id, updated: true } });
  },
);

/**
 * POST /api/admin/users/:id/verify-email
 *
 * Manually verifies a user's email address. Useful when the user did not
 * receive the verification email or when an admin needs to confirm an account
 * on behalf of the candidate.
 */
adminRouter.post(
  "/admin/users/:id/verify-email",
  requirePrincipal,
  requirePermission("user:manage"),
  validate({ params: idParam }),
  async (req, res) => {
    const { db } = getDatabase();
    const userId = param(req, "id");
    const [user] = await db
      .select({ id: schema.users.id, email: schema.users.email, fullName: schema.users.fullName, isEmailVerified: schema.users.isEmailVerified, isActive: schema.users.isActive, deletedAt: schema.users.deletedAt })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);
    if (!user) throw notFound("User not found");

    await db
      .update(schema.users)
      .set({ isEmailVerified: true })
      .where(eq(schema.users.id, user.id));

    await recordAudit({
      action: "USER_EMAIL_VERIFIED",
      actorId: req.principal!.userId,
      actorName: req.principal!.fullName,
      actorRole: req.principal!.roles[0] ?? null,
      entityType: "user",
      entityId: user.id,
      reason: `Email manually verified by administrator. Previous value was ${user.isEmailVerified ? "true" : "false"}.`,
      ipAddress: req.ipAddress ?? null,
      userAgent: req.userAgent ?? null,
      requestId: req.requestId,
    });

    // Also send a notification to the user via in-app notification
    await queueNotification({
      event: "ADMIN_NOTICE",
      recipientUserId: user.id,
      recipientEmail: user.email,
      deduplicationKey: `email-verified-${user.id}-${Date.now()}`,
      variables: {
        candidateName: user.fullName,
        reason: "An administrator has verified your email address. You can now sign in.",
      },
    });

    res.status(200).json({ data: { id: user.id, emailVerified: true } });
  },
);

/**
 * DELETE /api/admin/users/:id
 *
 * Soft-deletes a user account. The row is retained (deleted_at is set) so
 * that audit events remain valid, but the user can no longer authenticate.
 * Only a SUPER_ADMINISTRATOR may delete users, and an administrator cannot
 * delete their own account.
 */
adminRouter.delete(
  "/admin/users/:id",
  requirePrincipal,
  requirePermission("user:manage"),
  validate({ params: idParam, body: deleteUserBody }),
  async (req, res) => {
    const { db } = getDatabase();
    const userId = param(req, "id");

    if (userId === req.principal!.userId) {
      throw forbidden("You cannot delete your own account");
    }

    const [user] = await db
      .select({ id: schema.users.id, isActive: schema.users.isActive, deletedAt: schema.users.deletedAt })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);
    if (!user) throw notFound("User not found");
    if (user.deletedAt) {
      res.status(200).json({ data: { id: user.id, deleted: false } });
      return;
    }

    // Prevent deletion of users who carry active workloads. A candidate's
    // verification case is linked via candidate_profiles (not directly to
    // users), so soft-deleting a candidate does not orphan any case. Verifiers
    // or reviewers who are currently assigned, however, must be re-assigned first.
    const activeCases = await db
      .select({ id: schema.bgvCases.id })
      .from(schema.bgvCases)
      .where(
        or(
          eq(schema.bgvCases.assignedVerifierId, userId),
          eq(schema.bgvCases.assignedReviewerId, userId),
        ),
      )
      .limit(1);
    if (activeCases.length > 0) {
      throw validationError(
        "This user is assigned to active cases. Reassign them before deleting.",
      );
    }

    await db.transaction(async (tx) => {
      await tx
        .update(schema.users)
        .set({
          isActive: false,
          deletedAt: new Date(),
          sessionEpoch: sql`${schema.users.sessionEpoch} + 1`,
        })
        .where(eq(schema.users.id, userId));

      await recordAudit(
        {
          action: "USER_DELETED",
          actorId: req.principal!.userId,
          actorName: req.principal!.fullName,
          actorRole: req.principal!.roles[0] ?? null,
          entityType: "user",
          entityId: user.id,
          previousValue: { isActive: user.isActive },
          newValue: { isActive: false, deletedAt: new Date().toISOString() },
          reason: req.body.reason ?? "Account deleted by administrator",
          ipAddress: req.ipAddress ?? null,
          userAgent: req.userAgent ?? null,
          requestId: req.requestId,
        },
        tx,
      );
    });

    res.status(200).json({ data: { id: user.id, deleted: true } });
  },
);

/**
 * POST /admin/users/:id/reset-password
 *
 * Generates a temporary password for a user, sets mustChangePassword, and
 * invalidates all outstanding sessions. The temporary password is returned
 * once and must be communicated to the user out-of-band.
 */
adminRouter.post(
  "/admin/users/:id/reset-password",
  requirePrincipal,
  requirePermission("user:manage"),
  validate({ params: idParam }),
  async (req, res) => {
    const { db } = getDatabase();
    const userId = param(req, "id");

    if (userId === req.principal!.userId) {
      throw forbidden("You cannot reset your own password from the admin panel");
    }

    const [user] = await db
      .select({ id: schema.users.id, email: schema.users.email, fullName: schema.users.fullName, isActive: schema.users.isActive, deletedAt: schema.users.deletedAt })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);
    if (!user) throw notFound("User not found");
    if (user.deletedAt) throw notFound("User not found");

    const temporaryPassword = generatePassword();
    const passwordHash = await hash(temporaryPassword, {
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });

    await db
      .update(schema.users)
      .set({
        passwordHash,
        mustChangePassword: true,
        sessionEpoch: sql`${schema.users.sessionEpoch} + 1`,
      })
      .where(eq(schema.users.id, user.id));

    await recordAudit({
      action: "USER_PASSWORD_RESET",
      actorId: req.principal!.userId,
      actorName: req.principal!.fullName,
      actorRole: req.principal!.roles[0] ?? null,
      entityType: "user",
      entityId: user.id,
      reason: "Password reset by administrator",
      ipAddress: req.ipAddress ?? null,
      userAgent: req.userAgent ?? null,
       requestId: req.requestId,
    });

    await queueNotification({
      event: "ADMIN_NOTICE",
      recipientUserId: user.id,
      recipientEmail: user.email,
      deduplicationKey: `password-reset-${user.id}-${Date.now()}`,
      variables: {
        candidateName: user.fullName,
        caseNumber: "",
        reason: "An administrator has reset your password. Sign in with the temporary password and change it immediately.",
      },
    });

    res.status(200).json({ data: { userId: user.id, temporaryPassword } });
  },
);

/**
 * GET /api/admin/roles
 */
adminRouter.get(
  "/admin/roles",
  requirePrincipal,
  requirePermission("role:manage", "config:read"),
  async (_req, res) => {
    const { db } = getDatabase();
    const roles = await db.select().from(schema.roles).orderBy(asc(schema.roles.code));
    const rolePermissions = await db
      .select()
      .from(schema.rolePermissions)
      .orderBy(asc(schema.rolePermissions.roleCode));

    res.status(200).json({
      data: roles.map((role) => ({
        code: role.code,
        name: role.name,
        description: role.description,
        isSystem: role.isSystem,
        permissions: rolePermissions
          .filter((entry) => entry.roleCode === role.code)
          .map((entry) => entry.permissionCode as never),
      })),
    });
  },
);

/**
 * GET /api/admin/packages
 */
adminRouter.get(
  "/admin/packages",
  requirePrincipal,
  requirePermission("config:read", "package:manage"),
  async (_req, res) => {
    const { db } = getDatabase();
    const packages = await db
      .select()
      .from(schema.bgvPackages)
      .orderBy(asc(schema.bgvPackages.code));

    const requirements = await db
      .select({ packageId: schema.documentRequirements.packageId, value: count() })
      .from(schema.documentRequirements)
      .groupBy(schema.documentRequirements.packageId);

    const checks = await db
      .select({ packageId: schema.bgvPackageChecks.packageId, value: count() })
      .from(schema.bgvPackageChecks)
      .groupBy(schema.bgvPackageChecks.packageId);

    res.status(200).json({
      data: packages.map((pkg) => ({
        id: pkg.id,
        code: pkg.code,
        name: pkg.name,
        description: pkg.description,
        isActive: pkg.isActive,
        requiresMakerChecker: pkg.requiresMakerChecker,
        requirementCount: requirements.find((row) => row.packageId === pkg.id)?.value ?? 0,
        checkCount: checks.find((row) => row.packageId === pkg.id)?.value ?? 0,
        createdAt: pkg.createdAt.toISOString(),
      })),
    });
  },
);

/**
 * GET /api/admin/document-categories
 */
adminRouter.get(
  "/admin/document-categories",
  requirePrincipal,
  requirePermission("config:read", "documentcategory:manage"),
  async (_req, res) => {
    const { db } = getDatabase();
    const categories = await db
      .select()
      .from(schema.documentCategories)
      .orderBy(asc(schema.documentCategories.displayOrder));
    const types = await db
      .select()
      .from(schema.documentTypes)
      .orderBy(asc(schema.documentTypes.displayOrder));

    res.status(200).json({
      data: categories.map((category) => ({
        id: category.id,
        code: category.code,
        name: category.name,
        description: category.description,
        isActive: category.isActive,
        displayOrder: category.displayOrder,
        types: types
          .filter((type) => type.categoryId === category.id)
          .map((type) => ({ id: type.id, code: type.code, name: type.name, isActive: type.isActive })),
      })),
    });
  },
);

/**
 * GET /api/admin/config
 */
adminRouter.get(
  "/admin/config",
  requirePrincipal,
  requirePermission("config:read"),
  async (_req, res) => {
    const { db } = getDatabase();
    const rows = await db
      .select()
      .from(schema.systemConfig)
      .orderBy(asc(schema.systemConfig.category), asc(schema.systemConfig.key));

    res.status(200).json({
      data: rows.map((row) => ({
        key: row.key,
        value: row.isSecret ? "" : row.value,
        valueType: row.valueType,
        category: row.category,
        description: row.description,
        isSecret: row.isSecret,
        updatedAt: row.updatedAt.toISOString(),
      })),
    });
  },
);

/**
 * PATCH /api/admin/config/:key
 */
adminRouter.patch(
  "/admin/config/:key",
  requirePrincipal,
  requirePermission("config:manage"),
  validate({ params: configParam, body: updateSystemConfigSchema }),
  async (req, res) => {
    const { db } = getDatabase();
    const [existing] = await db
      .select()
      .from(schema.systemConfig)
      .where(eq(schema.systemConfig.key, param(req, "key")))
      .limit(1);
    if (!existing) throw notFound("Configuration key not found");

    await db.transaction(async (tx) => {
      await tx
        .update(schema.systemConfig)
        .set({ value: req.body.value, updatedBy: req.principal!.userId })
        .where(eq(schema.systemConfig.key, param(req, "key")));

      await recordAudit(
        {
          action: "CONFIG_CHANGED",
          actorId: req.principal!.userId,
          actorName: req.principal!.fullName,
          actorRole: req.principal!.roles[0] ?? null,
          entityType: "system_config",
          entityId: param(req, "key"),
          previousValue: { value: existing.isSecret ? "[REDACTED]" : existing.value },
          newValue: { value: req.body.value },
          reason: req.body.reason ?? null,
          ipAddress: req.ipAddress ?? null,
          userAgent: req.userAgent ?? null,
          requestId: req.requestId,
        },
        tx,
      );
    });

    clearConfigCache();
    res.status(200).json({ data: { key: param(req, "key"), updated: true } });
  },
);

/**
 * GET /api/admin/audit
 *
 * Read-only access to the append-only audit trail. There is no update or
 * delete route for audit events.
 */
adminRouter.get(
  "/admin/audit",
  requirePrincipal,
  requirePermission("audit:read"),
  validate({ query: auditFiltersSchema }),
  async (req, res) => {
    const { db } = getDatabase();
    const filters = req.query as unknown as z.infer<typeof auditFiltersSchema>;

    const conditions: SQL[] = [];
    if (filters.action) conditions.push(eq(schema.auditEvents.action, filters.action));
    if (filters.actorId) conditions.push(eq(schema.auditEvents.actorId, filters.actorId));
    if (filters.entityType) conditions.push(eq(schema.auditEvents.entityType, filters.entityType));
    if (filters.entityId) conditions.push(eq(schema.auditEvents.entityId, filters.entityId));
    if (filters.caseId) conditions.push(eq(schema.auditEvents.caseId, filters.caseId));
    if (filters.candidateId) conditions.push(eq(schema.auditEvents.candidateId, filters.candidateId));
    if (filters.from) conditions.push(gte(schema.auditEvents.createdAt, new Date(filters.from)));
    if (filters.to) {
      const to = new Date(filters.to);
      to.setUTCHours(23, 59, 59, 999);
      conditions.push(lte(schema.auditEvents.createdAt, to));
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const totalRows = await db
      .select({ value: count() })
      .from(schema.auditEvents)
      .where(where);

    const rows = await db
      .select()
      .from(schema.auditEvents)
      .where(where)
      .orderBy(desc(schema.auditEvents.createdAt))
      .limit(filters.pageSize)
      .offset((filters.page - 1) * filters.pageSize);

    const total = totalRows[0]?.value ?? 0;
    res.status(200).json({
      data: rows.map((row) => ({
        id: row.id,
        action: row.action,
        actorId: row.actorId,
        actorName: row.actorName,
        actorRole: row.actorRole,
        entityType: row.entityType,
        entityId: row.entityId,
        caseId: row.caseId,
        candidateId: row.candidateId,
        previousValue: row.previousValue,
        newValue: row.newValue,
        reason: row.reason,
        ipAddress: row.ipAddress,
        requestId: row.requestId,
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
 * GET /api/admin/scoring-configs
 */
adminRouter.get(
  "/admin/scoring-configs",
  requirePrincipal,
  requirePermission("config:read", "score:generate"),
  async (_req, res) => {
    const { db } = getDatabase();
    const configs = await db
      .select()
      .from(schema.scoringConfigurations)
      .orderBy(desc(schema.scoringConfigurations.version));
    const components = await db.select().from(schema.scoringConfigComponents);

    res.status(200).json({
      data: configs.map((config) => ({
        id: config.id,
        version: config.version,
        name: config.name,
        threshold: Number(config.threshold),
        status: config.status,
        isApproved: config.isApproved,
        approvedById: config.approvedBy,
        approvedAt: config.approvedAt?.toISOString() ?? null,
        notes: config.notes,
        createdAt: config.createdAt.toISOString(),
        components: components
          .filter((component) => component.scoringConfigId === config.id)
          .map((component) => ({
            checkTypeCodes: component.checkTypeCodes,
            label: component.label,
            weight: Number(component.weight),
          })),
      })),
    });
  },
);

/**
 * POST /api/admin/scoring-configs
 */
adminRouter.post(
  "/admin/scoring-configs",
  requirePrincipal,
  requirePermission("config:manage"),
  validate({ body: createScoringConfigSchema }),
  async (req, res) => {
    const payload = body<z.infer<typeof createScoringConfigSchema>>(req);
    const { db } = getDatabase();
    const totalWeight = payload.components.reduce((sum: number, component) => sum + component.weight, 0);
    if (Math.abs(totalWeight - 100) > 0.01) {
      throw validationError(
        `The component weights must add up to 100. They currently add up to ${totalWeight}.`,
      );
    }

    const [latest] = await db
      .select({ version: schema.scoringConfigurations.version })
      .from(schema.scoringConfigurations)
      .orderBy(desc(schema.scoringConfigurations.version))
      .limit(1);
    const version = (latest?.version ?? 0) + 1;
    const configId = newId();

    await db.transaction(async (tx) => {
      await tx.insert(schema.scoringConfigurations).values({
        id: configId,
        version,
        name: req.body.name,
        threshold: req.body.threshold.toFixed(2),
        allowProvisional: false,
        status: "DRAFT",
        isApproved: false,
        notes: req.body.notes ?? null,
      });

      await tx.insert(schema.scoringConfigComponents).values(
        payload.components.map((component) => ({
          id: newId(),
          scoringConfigId: configId,
          checkTypeCodes: component.checkTypeCodes,
          label: component.label,
          weight: component.weight.toFixed(2),
          outcomeMultipliers: {
            VERIFIED: 1,
            PARTIALLY_VERIFIED: 0.5,
            UNABLE_TO_VERIFY: 0,
            DISCREPANCY_FOUND: 0,
            REJECTED: 0,
          },
          excludedStatuses: ["WAIVED", "NOT_APPLICABLE"],
        })),
      );

      await recordAudit(
        {
          action: "CONFIG_CHANGED",
          actorId: req.principal!.userId,
          actorName: req.principal!.fullName,
          actorRole: req.principal!.roles[0] ?? null,
          entityType: "scoring_configuration",
          entityId: configId,
          newValue: { version, name: req.body.name, threshold: req.body.threshold },
          ipAddress: req.ipAddress ?? null,
          userAgent: req.userAgent ?? null,
          requestId: req.requestId,
        },
        tx,
      );
    });

    res.status(201).json({ data: { id: configId, version, status: "DRAFT" } });
  },
);

/**
 * POST /api/admin/scoring-configs/:id/approve
 *
 * A scoring configuration must be approved before it can be activated and used
 * to produce a score.
 */
adminRouter.post(
  "/admin/scoring-configs/:id/approve",
  requirePrincipal,
  requirePermission("config:manage"),
  validate({ params: idParam }),
  async (req, res) => {
    const { db } = getDatabase();
    const [config] = await db
      .select()
      .from(schema.scoringConfigurations)
      .where(eq(schema.scoringConfigurations.id, param(req, "id")))
      .limit(1);
    if (!config) throw notFound("Scoring configuration not found");

    await db.transaction(async (tx) => {
      await tx
        .update(schema.scoringConfigurations)
        .set({
          isApproved: true,
          approvedBy: req.principal!.userId,
          approvedAt: new Date(),
        })
        .where(eq(schema.scoringConfigurations.id, config.id));

      await recordAudit(
        {
          action: "CONFIG_CHANGED",
          actorId: req.principal!.userId,
          actorName: req.principal!.fullName,
          actorRole: req.principal!.roles[0] ?? null,
          entityType: "scoring_configuration",
          entityId: config.id,
          previousValue: { isApproved: config.isApproved, status: config.status },
          newValue: { isApproved: true },
          ipAddress: req.ipAddress ?? null,
          userAgent: req.userAgent ?? null,
          requestId: req.requestId,
        },
        tx,
      );
    });

    res.status(200).json({ data: { id: config.id, isApproved: true } });
  },
);

/**
 * POST /api/admin/scoring-configs/:id/activate
 */
adminRouter.post(
  "/admin/scoring-configs/:id/activate",
  requirePrincipal,
  requirePermission("config:manage"),
  validate({ params: idParam }),
  async (req, res) => {
    const { db } = getDatabase();
    const [config] = await db
      .select()
      .from(schema.scoringConfigurations)
      .where(eq(schema.scoringConfigurations.id, param(req, "id")))
      .limit(1);
    if (!config) throw notFound("Scoring configuration not found");
    if (!config.isApproved) {
      throw validationError("A scoring configuration must be approved before it can be activated.");
    }

    await db.transaction(async (tx) => {
      await tx
        .update(schema.scoringConfigurations)
        .set({ status: "RETIRED" })
        .where(eq(schema.scoringConfigurations.status, "ACTIVE"));
      await tx
        .update(schema.scoringConfigurations)
        .set({ status: "ACTIVE" })
        .where(eq(schema.scoringConfigurations.id, config.id));

      await recordAudit(
        {
          action: "CONFIG_CHANGED",
          actorId: req.principal!.userId,
          actorName: req.principal!.fullName,
          actorRole: req.principal!.roles[0] ?? null,
          entityType: "scoring_configuration",
          entityId: config.id,
          previousValue: { status: config.status },
          newValue: { status: "ACTIVE" },
          ipAddress: req.ipAddress ?? null,
          userAgent: req.userAgent ?? null,
          requestId: req.requestId,
        },
        tx,
      );
    });

    res.status(200).json({ data: { id: config.id, status: "ACTIVE" } });
  },
);

/**
 * PUT /api/admin/notification-templates/:event/:channel
 */
adminRouter.put(
  "/admin/notification-templates/:event/:channel",
  requirePrincipal,
  requirePermission("notification:manage"),
  validate({ params: templateParam, body: upsertNotificationTemplateSchema }),
  async (req, res) => {
    const { db } = getDatabase();
    const [existing] = await db
      .select()
      .from(schema.notificationTemplates)
      .where(
        and(
          eq(schema.notificationTemplates.event, param(req, "event")),
          eq(schema.notificationTemplates.channel, param(req, "channel")),
        ),
      )
      .limit(1);

    if (existing) {
      await db
        .update(schema.notificationTemplates)
        .set({
          name: req.body.name,
          subjectTemplate: req.body.subjectTemplate,
          bodyTemplate: req.body.bodyTemplate,
          isActive: req.body.isActive,
        })
        .where(eq(schema.notificationTemplates.id, existing.id));
      res.status(200).json({ data: { id: existing.id, updated: true } });
      return;
    }

    const id = newId();
    await db.insert(schema.notificationTemplates).values({
      id,
      event: param(req, "event"),
      channel: param(req, "channel"),
      name: req.body.name,
      subjectTemplate: req.body.subjectTemplate,
      bodyTemplate: req.body.bodyTemplate,
      isActive: req.body.isActive,
    });
    res.status(201).json({ data: { id, created: true } });
  },
);

/** Generates a temporary password that satisfies the password policy. */
function generatePassword(): string {
  const lower = "abcdefghjkmnpqrstuvwxyz";
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "23456789";
  const symbols = "!#$%&*?";
  const all = lower + upper + digits + symbols;

  const parts = [
    lower[Math.floor(Math.random() * lower.length)],
    upper[Math.floor(Math.random() * upper.length)],
    digits[Math.floor(Math.random() * digits.length)],
    symbols[Math.floor(Math.random() * symbols.length)],
  ];
  for (let i = 0; i < 12; i++) {
    parts.push(all[Math.floor(Math.random() * all.length)]);
  }
  return parts.sort(() => Math.random() - 0.5).join("");
}

