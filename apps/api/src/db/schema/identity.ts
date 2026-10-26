import {
  boolean,
  timestamp,
  index,
  int,
  mysqlTable,
  primaryKey,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

/**
 * Identity, authentication and role based access control.
 */

export const users = mysqlTable(
  "users",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    email: varchar("email", { length: 254 }).notNull(),
    /** Lower-cased, trimmed email used for uniqueness and lookups. */
    emailNormalized: varchar("email_normalized", { length: 254 }).notNull(),
    passwordHash: varchar("password_hash", { length: 255 }).notNull(),
    fullName: varchar("full_name", { length: 160 }).notNull(),
    mobile: varchar("mobile", { length: 32 }).notNull(),
    isActive: boolean("is_active").notNull().default(true),
    isEmailVerified: boolean("is_email_verified").notNull().default(false),
    mustChangePassword: boolean("must_change_password").notNull().default(false),
    /**
     * Incremented when the account is deactivated or credentials change.
     * Sessions whose epoch no longer matches are rejected, which invalidates
     * outstanding refresh tokens without a cleanup job.
     */
    sessionEpoch: int("session_epoch").notNull().default(1),
    failedLoginAttempts: int("failed_login_attempts").notNull().default(0),
    lockedUntil: timestamp("locked_until", { mode: "date" }),
    lastLoginAt: timestamp("last_login_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date", fsp: 3 }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow().onUpdateNow(),
    /**
     * Set when an administrator deletes the account. The row is retained
     * (not hard-deleted) so that audit events remain valid, but the user
     * cannot authenticate.
     */
    deletedAt: timestamp("deleted_at", { mode: "date", fsp: 3 }),
  },
  (t) => [
    uniqueIndex("uq_users_email_normalized").on(t.emailNormalized),
    index("ix_users_active").on(t.isActive),
  ],
);

export const roles = mysqlTable("roles", {
  code: varchar("code", { length: 32 }).primaryKey(),
  name: varchar("name", { length: 80 }).notNull(),
  description: varchar("description", { length: 500 }),
  /** System roles are seeded and cannot be deleted. */
  isSystem: boolean("is_system").notNull().default(false),
  createdAt: timestamp("created_at", { mode: "date", fsp: 3 }).notNull().defaultNow(),
});

export const permissions = mysqlTable("permissions", {
  code: varchar("code", { length: 64 }).primaryKey(),
  description: varchar("description", { length: 300 }).notNull(),
  category: varchar("category", { length: 48 }).notNull(),
});

export const rolePermissions = mysqlTable(
  "role_permissions",
  {
    roleCode: varchar("role_code", { length: 32 })
      .notNull()
      .references(() => roles.code, { onDelete: "cascade" }),
    permissionCode: varchar("permission_code", { length: 64 })
      .notNull()
      .references(() => permissions.code, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.roleCode, t.permissionCode] })],
);

export const userRoles = mysqlTable(
  "user_roles",
  {
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleCode: varchar("role_code", { length: 32 })
      .notNull()
      .references(() => roles.code, { onDelete: "cascade" }),
    assignedBy: varchar("assigned_by", { length: 36 }).references(() => users.id, {
      onDelete: "set null",
    }),
    assignedAt: timestamp("assigned_at", { mode: "date", fsp: 3 }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { mode: "date" }),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.roleCode] }),
    index("ix_user_roles_role").on(t.roleCode),
  ],
);

export const authSessions = mysqlTable(
  "auth_sessions",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** SHA-256 of the refresh token. The raw token is never stored. */
    refreshTokenHash: varchar("refresh_token_hash", { length: 64 }).notNull(),
    /** Rotating refresh tokens share a family id; reuse detection revokes the family. */
    familyId: varchar("family_id", { length: 36 }).notNull(),
    issuedAt: timestamp("issued_at", { mode: "date", fsp: 3 }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
    revokedAt: timestamp("revoked_at", { mode: "date" }),
    revokedReason: varchar("revoked_reason", { length: 120 }),
    replacedBySessionId: varchar("replaced_by_session_id", { length: 36 }),
    userAgent: varchar("user_agent", { length: 300 }),
    ipAddress: varchar("ip_address", { length: 64 }),
  },
  (t) => [
    uniqueIndex("uq_auth_sessions_refresh_hash").on(t.refreshTokenHash),
    index("ix_auth_sessions_user").on(t.userId),
    index("ix_auth_sessions_family").on(t.familyId),
    index("ix_auth_sessions_expires").on(t.expiresAt),
  ],
);

export const emailVerificationTokens = mysqlTable(
  "email_verification_tokens",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
    createdAt: timestamp("created_at", { mode: "date", fsp: 3 }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_email_verification_tokens_hash").on(t.tokenHash),
    index("ix_email_verification_tokens_user").on(t.userId),
  ],
);
