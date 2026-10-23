import { hash, verify } from "@node-rs/argon2";
import type { AuthResponse, LoginRequest, SessionUser, SignupRequest } from "@checkiq/contracts";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { getDatabase, schema } from "../../db/client.js";

import type { Tx } from "../../db/types.js";
import { candidateIdInUse, conflict, forbidden, invalidTransition, notFound, unauthenticated, validationError } from "../../lib/errors.js";
import { newId, newToken } from "../../lib/ids.js";
import { sha256 } from "../../lib/crypto.js";
import { createCaseForProfile } from "../../services/case.service.js";
import { recordAudit } from "../../services/audit.service.js";
import { queueNotification } from "../../services/notification.service.js";
import { getBooleanConfig, getPatternConfig, getStringConfig } from "../../services/config.service.js";
import { issueAccessToken } from "./tokens.js";
import { getLogger } from "../../lib/logger.js";
import { getConfig } from "../../config.js";

/**
 * Authentication service.
 *
 * Signup accepts a Candidate ID that has not been pre-registered. Possession of
 * a Candidate ID is never treated as proof of identity or authorisation — it
 * only identifies the case being created. Every subsequent operation requires
 * an authenticated session.
 */

const ARGON2_OPTIONS = {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

export interface AuthResult {
  response: AuthResponse;
  /** Returned to the caller so it can be set as an httpOnly cookie. */
  refreshToken: string;
}

export interface RequestContext {
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
}

export const REFRESH_COOKIE_NAME = "checkiq_refresh";

async function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

/** Loads the roles, permissions and candidate identity of a user. */
export async function buildSessionUser(userId: string): Promise<SessionUser> {
  const { db } = getDatabase();
  const [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  if (!user) throw unauthenticated();

  const roleRows = await db
    .select({ code: schema.userRoles.roleCode })
    .from(schema.userRoles)
    .where(and(eq(schema.userRoles.userId, userId), isNull(schema.userRoles.revokedAt)));
  const roles = roleRows.map((row) => row.code);

  const permissions = new Set<string>();
  if (roles.length > 0) {
    const permissionRows = await db
      .select({ code: schema.rolePermissions.permissionCode })
      .from(schema.rolePermissions)
      .where(inArray(schema.rolePermissions.roleCode, roles));
    for (const row of permissionRows) permissions.add(row.code);
  }

  const [profile] = await db
    .select({ candidateId: schema.candidateProfiles.candidateId })
    .from(schema.candidateProfiles)
    .where(eq(schema.candidateProfiles.userId, userId))
    .limit(1);

  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    roles: roles as SessionUser["roles"],
    permissions: [...permissions],
    candidateId: profile?.candidateId ?? null,
    mustChangePassword: user.mustChangePassword,
  };
}

interface IssuedSession {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
  sessionId: string;
}

interface SessionSubject {
  id: string;
  email: string;
  fullName: string;
  sessionEpoch: number;
}

async function issueSession(
  tx: Tx,
  user: SessionSubject,
  roles: string[],
  context: RequestContext,
): Promise<IssuedSession> {
  const config = getConfig();
  const sessionId = newId();
  const familyId = newId();
  const refreshToken = newToken(48);
  const expiresAt = new Date(Date.now() + config.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

  await tx.insert(schema.authSessions).values({
    id: sessionId,
    userId: user.id,
    refreshTokenHash: sha256(refreshToken),
    familyId,
    expiresAt,
    userAgent: context.userAgent ?? null,
    ipAddress: context.ipAddress ?? null,
  });

  const accessToken = await issueAccessToken({
    sub: user.id,
    email: user.email,
    fullName: user.fullName,
    sessionId,
    sessionEpoch: user.sessionEpoch,
    roles,
  });

  return {
    accessToken,
    refreshToken,
    expiresInSeconds: config.ACCESS_TOKEN_TTL_MINUTES * 60,
    sessionId,
  };
}

/**
 * Registers a new candidate.
 *
 * The Candidate ID is validated against the configured pattern and must not
 * already be in use. A duplicate is reported explicitly — accounts and cases
 * are never silently merged or overwritten.
 */
export interface SignupResult {
  userId: string;
  email: string;
  fullName: string;
  requiresEmailVerification: boolean;
  /** Raw verification token; only populated in development for testing convenience. */
  verificationToken?: string | null;
}

export async function signup(input: SignupRequest, context: RequestContext): Promise<SignupResult> {
  const { db } = getDatabase();

  if (input.password !== input.confirmPassword) {
    throw validationError("The passwords do not match.");
  }

  const pattern = await getPatternConfig(
    "candidate_id.pattern",
    /^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/,
  );
  if (!pattern.test(input.candidateId)) {
    throw validationError(
      "The Candidate ID format is not valid. Enter the Candidate ID exactly as issued to you.",
    );
  }

  const normalisedCandidateId = input.candidateId.trim();
  const emailNormalized = input.email.trim().toLowerCase();

  const [existingProfile] = await db
    .select({ id: schema.candidateProfiles.id, candidateId: schema.candidateProfiles.candidateId })
    .from(schema.candidateProfiles)
    .where(eq(schema.candidateProfiles.candidateId, normalisedCandidateId))
    .limit(1);

  if (existingProfile) {
    const supportContact = await getStringConfig("support.contact_email", "");
    await recordAudit({
      action: "CANDIDATE_ID_DUPLICATE_REJECTED",
      entityType: "candidate_profile",
      entityId: existingProfile.id,
      candidateId: normalisedCandidateId,
      reason: "Signup attempted with a Candidate ID that is already registered",
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent ?? null,
      requestId: context.requestId ?? null,
    });
    throw candidateIdInUse(
      "This Candidate ID is already registered. Sign in with the account you created, or contact support if you believe this is an error.",
      {
        candidateId: normalisedCandidateId,
        canSignIn: true,
        supportContactConfigured: supportContact.length > 0,
      },
    );
  }

  const [existingUser] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.emailNormalized, emailNormalized))
    .limit(1);

  if (existingUser) {
    throw conflict("An account already exists for this email address. Sign in instead.");
  }

  const passwordHash = await hashPassword(input.password);
  const userId = newId();
  let createdCaseId = "";

  await db.transaction(async (tx) => {
    await tx.insert(schema.users).values({
      id: userId,
      email: input.email.trim(),
      emailNormalized,
      passwordHash,
      fullName: input.fullName.trim(),
      mobile: input.mobile.trim(),
    });

    await tx.insert(schema.userRoles).values({
      userId,
      roleCode: "CANDIDATE",
      assignedBy: null,
    });

    const profileId = newId();
    await tx.insert(schema.candidateProfiles).values({
      id: profileId,
      userId,
      candidateId: normalisedCandidateId,
      fullName: input.fullName.trim(),
      email: input.email.trim(),
      mobile: input.mobile.trim(),
    });

    const caseId = await createCaseForProfile(tx, {
      profileId,
      company: input.company ?? null,
      department: input.department ?? null,
      position: input.position ?? null,
    });
    createdCaseId = caseId;

    await recordAudit(
      {
        action: "USER_CREATED",
        actorId: userId,
        actorName: input.fullName.trim(),
        actorRole: "CANDIDATE",
        entityType: "user",
        entityId: userId,
        candidateId: normalisedCandidateId,
        newValue: { email: emailNormalized, role: "CANDIDATE" },
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent ?? null,
        requestId: context.requestId ?? null,
      },
      tx,
    );

    await recordAudit(
      {
        action: "CANDIDATE_ID_REGISTERED",
        actorId: userId,
        actorName: input.fullName.trim(),
        actorRole: "CANDIDATE",
        entityType: "candidate_profile",
        entityId: profileId,
        caseId,
        candidateId: normalisedCandidateId,
        newValue: { candidateId: normalisedCandidateId },
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent ?? null,
        requestId: context.requestId ?? null,
      },
      tx,
    );

    await recordAudit(
      {
        action: "CASE_CREATED",
        actorId: userId,
        actorName: input.fullName.trim(),
        actorRole: "CANDIDATE",
        entityType: "bgv_case",
        entityId: caseId,
        caseId,
        candidateId: normalisedCandidateId,
        newValue: { status: "DOCUMENT_UPLOAD_IN_PROGRESS" },
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent ?? null,
        requestId: context.requestId ?? null,
      },
      tx,
    );
  });

  await queueNotification({
    event: "ACCOUNT_CREATED",
    recipientUserId: userId,
    recipientEmail: input.email.trim(),
    caseId: createdCaseId,
    deduplicationKey: `account-created-${userId}`,
    variables: {
      candidateName: input.fullName.trim(),
      candidateId: normalisedCandidateId,
      caseNumber: "",
    },
  });

   // Send email verification
  const verificationEnabled = await getBooleanConfig("email_verification.enabled", true);
  let verificationToken: string | null = null;
  if (verificationEnabled) {
    try {
      const { sendVerificationEmail } = await import("./email-verification.service.js");
      const result = await sendVerificationEmail({
        userId,
        email: input.email.trim(),
        fullName: input.fullName.trim(),
        candidateId: normalisedCandidateId,
      });
      // In development, return the verification token for testing convenience.
      if (getConfig().NODE_ENV === "development") {
        verificationToken = result.token;
      }
    } catch (emailErr) {
      getLogger().warn({ userId, err: emailErr }, "Failed to send verification email");
    }
  }

  return {
    userId,
    email: input.email.trim(),
    fullName: input.fullName.trim(),
    requiresEmailVerification: verificationEnabled,
    verificationToken: getConfig().NODE_ENV === "development" ? verificationToken : undefined,
  };
}

/** Signs a user in with an email address. */
export async function login(input: LoginRequest, context: RequestContext): Promise<AuthResult> {
  const { db } = getDatabase();
  const identifier = input.identifier.trim().toLowerCase();

  const [userByEmail] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.emailNormalized, identifier))
    .limit(1);

  const resolvedUser = userByEmail;
  if (!resolvedUser) {
    // No candidate ID lookup - email only for sign-in
    await hash("invalid-placeholder-password", ARGON2_OPTIONS).catch(() => "");
    await recordAudit({
      action: "AUTH_LOGIN_FAILED",
      entityType: "user",
      reason: "No account matched the supplied email",
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent ?? null,
      requestId: context.requestId ?? null,
    });
    throw unauthenticated("The email address or password is incorrect");
  }

  if (!resolvedUser.isActive) {
    await recordAudit({
      action: "AUTH_LOGIN_FAILED",
      actorId: resolvedUser.id,
      entityType: "user",
      entityId: resolvedUser.id,
      reason: "Account is disabled",
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent ?? null,
      requestId: context.requestId ?? null,
    });
    throw forbidden("This account has been disabled. Contact your administrator.");
  }

  const passwordMatches = await verify(resolvedUser.passwordHash, input.password).catch(() => false);
  if (!passwordMatches) {
    await db
      .update(schema.users)
      .set({ failedLoginAttempts: resolvedUser.failedLoginAttempts + 1 })
      .where(eq(schema.users.id, resolvedUser.id));
    await recordAudit({
      action: "AUTH_LOGIN_FAILED",
      actorId: resolvedUser.id,
      entityType: "user",
      entityId: resolvedUser.id,
      reason: "Incorrect password",
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent ?? null,
      requestId: context.requestId ?? null,
    });
     throw unauthenticated("The email address or password is incorrect");
  }

  const roleRows = await db
    .select({ code: schema.userRoles.roleCode })
    .from(schema.userRoles)
    .where(and(eq(schema.userRoles.userId, resolvedUser.id), isNull(schema.userRoles.revokedAt)));
  const roles = roleRows.map((row) => row.code);

  // Check email verification - staff/admin accounts are exempt
  const verificationEnabled = await getBooleanConfig("email_verification.enabled", true);
  if (verificationEnabled) {
    const isAdmin = roles.some((r) => r === "ADMINISTRATOR" || r === "SUPER_ADMINISTRATOR");
    if (!isAdmin && !resolvedUser.isEmailVerified) {
      await recordAudit({
        action: "AUTH_LOGIN_FAILED",
        actorId: resolvedUser.id,
        actorName: resolvedUser.fullName,
        entityType: "user",
        entityId: resolvedUser.id,
        reason: "Email not verified",
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent ?? null,
        requestId: context.requestId ?? null,
      });
      throw unauthenticated(
        "Please verify your email address before signing in. Check your inbox for a verification link or request a new one.",
      );
    }
  }

  const session = await db.transaction(async (tx) => {
    await tx
      .update(schema.users)
      .set({ lastLoginAt: new Date(), failedLoginAttempts: 0 })
      .where(eq(schema.users.id, resolvedUser.id));

    const issued = await issueSession(
      tx,
      { id: resolvedUser.id, email: resolvedUser.email, fullName: resolvedUser.fullName, sessionEpoch: resolvedUser.sessionEpoch },
      roles,
      context,
    );

    await recordAudit(
      {
        action: "AUTH_LOGIN_SUCCEEDED",
        actorId: resolvedUser.id,
        actorName: resolvedUser.fullName,
        actorRole: roles[0] ?? null,
        entityType: "user",
        entityId: resolvedUser.id,
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent ?? null,
        requestId: context.requestId ?? null,
      },
      tx,
    );

    return issued;
  });

  const sessionUser = await buildSessionUser(resolvedUser.id);
  return {
    response: {
      user: sessionUser,
      accessToken: session.accessToken,
      expiresInSeconds: session.expiresInSeconds,
    },
    refreshToken: session.refreshToken,
  };
}

/**
 * Rotates a refresh token.
 *
 * Re-use of a token that has already been rotated revokes the whole family —
 * the standard refresh-token-rotation defence against token theft.
 */
export async function refresh(
  rawRefreshToken: string | undefined,
  context: RequestContext,
): Promise<AuthResult> {
  if (!rawRefreshToken) throw unauthenticated("No session was found");

  const { db } = getDatabase();
  const tokenHash = sha256(rawRefreshToken);

  const [session] = await db
    .select()
    .from(schema.authSessions)
    .where(eq(schema.authSessions.refreshTokenHash, tokenHash))
    .limit(1);

  if (!session) throw unauthenticated("Your session is no longer valid");

  if (session.revokedAt) {
    await db
      .update(schema.authSessions)
      .set({ revokedAt: new Date(), revokedReason: "Refresh token reuse detected" })
      .where(eq(schema.authSessions.familyId, session.familyId));
    await recordAudit({
      action: "AUTH_LOGOUT",
      actorId: session.userId,
      entityType: "auth_session",
      entityId: session.id,
      reason: "Refresh token reuse detected — session family revoked",
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent ?? null,
      requestId: context.requestId ?? null,
    });
    throw unauthenticated("Your session is no longer valid");
  }

  if (session.expiresAt.getTime() <= Date.now()) {
    throw unauthenticated("Your session has expired. Please sign in again.");
  }

  const [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, session.userId))
    .limit(1);
  if (!user || !user.isActive) throw unauthenticated("Your account is not active");

  const roleRows = await db
    .select({ code: schema.userRoles.roleCode })
    .from(schema.userRoles)
    .where(and(eq(schema.userRoles.userId, user.id), isNull(schema.userRoles.revokedAt)));
  const roles = roleRows.map((row) => row.code);

  const issued = await db.transaction(async (tx) => {
    await tx
      .update(schema.authSessions)
      .set({ revokedAt: new Date(), revokedReason: "Rotated" })
      .where(eq(schema.authSessions.id, session.id));

    const next = await issueSession(
      tx,
      { id: user.id, email: user.email, fullName: user.fullName, sessionEpoch: user.sessionEpoch },
      roles,
      context,
    );

    await tx
      .update(schema.authSessions)
      .set({ replacedBySessionId: next.sessionId })
      .where(eq(schema.authSessions.id, session.id));

    await recordAudit(
      {
        action: "AUTH_TOKEN_REFRESHED",
        actorId: user.id,
        actorName: user.fullName,
        actorRole: roles[0] ?? null,
        entityType: "auth_session",
        entityId: next.sessionId,
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent ?? null,
        requestId: context.requestId ?? null,
      },
      tx,
    );

    return next;
  });

  const sessionUser = await buildSessionUser(user.id);
  return {
    response: {
      user: sessionUser,
      accessToken: issued.accessToken,
      expiresInSeconds: issued.expiresInSeconds,
    },
    refreshToken: issued.refreshToken,
  };
}

/** Revokes the current session. */
export async function logout(
  rawRefreshToken: string | undefined,
  userId: string | null,
  context: RequestContext,
): Promise<void> {
  if (!rawRefreshToken) return;
  const { db } = getDatabase();
  const tokenHash = sha256(rawRefreshToken);
  const [session] = await db
    .select()
    .from(schema.authSessions)
    .where(eq(schema.authSessions.refreshTokenHash, tokenHash))
    .limit(1);
  if (!session) return;

  await db
    .update(schema.authSessions)
    .set({ revokedAt: new Date(), revokedReason: "Signed out" })
    .where(eq(schema.authSessions.id, session.id));

  await recordAudit({
    action: "AUTH_LOGOUT",
    actorId: userId ?? session.userId,
    entityType: "auth_session",
    entityId: session.id,
    ipAddress: context.ipAddress ?? null,
    userAgent: context.userAgent ?? null,
    requestId: context.requestId ?? null,
  });
}

/** Changes the signed-in user's password. */
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
  context: RequestContext,
): Promise<void> {
  const { db } = getDatabase();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  if (!user) throw notFound("User not found");

  const matches = await verify(user.passwordHash, currentPassword).catch(() => false);
  if (!matches) throw validationError("The current password is incorrect.");

  const passwordHash = await hashPassword(newPassword);
  await db
    .update(schema.users)
    .set({
      passwordHash,
      mustChangePassword: false,
      // Invalidates every outstanding refresh token.
      sessionEpoch: user.sessionEpoch + 1,
    })
    .where(eq(schema.users.id, userId));

  await recordAudit({
    action: "AUTH_PASSWORD_CHANGED",
    actorId: userId,
    entityType: "user",
    entityId: userId,
    ipAddress: context.ipAddress ?? null,
    userAgent: context.userAgent ?? null,
    requestId: context.requestId ?? null,
  });
}

export { invalidTransition };
