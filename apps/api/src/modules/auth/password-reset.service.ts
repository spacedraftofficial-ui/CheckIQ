import { hash } from "@node-rs/argon2";
import { and, eq, isNull, sql } from "drizzle-orm";
import { getDatabase, schema } from "../../db/client.js";
import { getLogger } from "../../lib/logger.js";
import { newId } from "../../lib/ids.js";
import { sendEmail } from "../../services/email.service.js";
import { getNumberConfig } from "../../services/config.service.js";
import { recordAudit } from "../../services/audit.service.js";
import { notFound, unauthenticated } from "../../lib/errors.js";
import { MAX_OTP_ATTEMPTS, escapeHtml, generateOtp, hashOtp, otpMatches } from "./otp.js";

const ARGON2_OPTIONS = {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

/**
 * Password reset via email OTP.
 *
 * A candidate who has forgotten their password can request a 6-digit code sent
 * to their account email address. The code is single-use and short-lived, and
 * presenting it allows setting a new password (which invalidates all existing
 * sessions via the session epoch).
 */

export interface SendPasswordResetOtpResult {
  sent: boolean;
  message: string;
}

/**
 * Sends a password reset OTP to the account owning the given email address.
 *
 * The response is deliberately enumeration-safe: the same success message is
 * returned whether or not an account exists for the email, so callers cannot
 * probe for registered addresses.
 */
export async function sendPasswordResetOtp(
  email: string,
): Promise<SendPasswordResetOtpResult> {
  const logger = getLogger();
  const { db } = getDatabase();

  const emailNormalized = email.trim().toLowerCase();
  const [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.emailNormalized, emailNormalized))
    .limit(1);

  const ttlMinutes = await getNumberConfig(
    "auth.password_reset.token_ttl_minutes",
    60,
  );
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

  const okMessage =
    "If an account exists for this email address, a password reset code has been sent";

  if (!user) {
    return { sent: false, message: okMessage };
  }

  if (!user.isActive || user.deletedAt) {
    return { sent: false, message: okMessage };
  }

  // Invalidate any earlier reset tokens for this user (single active code).
  await db
    .delete(schema.passwordResetTokens)
    .where(eq(schema.passwordResetTokens.userId, user.id));

  const code = generateOtp();
  const codeHash = hashOtp(code);
  const tokenId = newId();

  await db.insert(schema.passwordResetTokens).values({
    id: tokenId,
    userId: user.id,
    tokenHash: codeHash,
    expiresAt,
  });

  const subject = "Your CheckIQ password reset code";
  const html = `
    <h2>Reset your password</h2>
    <p>Hello ${escapeHtml(user.fullName)},</p>
    <p>You requested a password reset for your CheckIQ account.</p>
    <p>Your reset code is:</p>
    <p style="font-size: 2rem; font-weight: bold; letter-spacing: 0.25em; margin: 1rem 0; padding: 0.5rem 1rem; background: #f5f5f5; border-radius: 8px; display: inline-block;">${code}</p>
    <p>This code expires in ${ttlMinutes} minutes.</p>
    <p>If you did not request this, you can ignore this email — your password will not be changed.</p>
  `;

  const result = await sendEmail({
    to: user.email,
    subject,
    html,
  });

  if (result.delivered) {
    logger.info({ userId: user.id, providerId: result.providerId }, "Password reset email sent");
  } else {
    logger.error(
      { userId: user.id, error: result.error },
      "Failed to send password reset email",
    );
  }

  return { sent: true, message: okMessage };
}

export interface VerifyPasswordResetOtpResult {
  userId: string;
}

/**
 * Verifies a single-use password reset code for the given email address.
 *
 * The code is looked up through the account, never on its own, so a guessed
 * code cannot reset some other account's password. Wrong codes count against
 * the attempt limit; at the limit the code is destroyed. On success the code
 * is consumed and the user id is returned so the caller can set the password.
 */
export async function verifyPasswordResetOtp(
  email: string,
  code: string,
): Promise<VerifyPasswordResetOtpResult> {
  const { db } = getDatabase();

  const [user] = await db
    .select({ id: schema.users.id, isActive: schema.users.isActive })
    .from(schema.users)
    .where(and(eq(schema.users.emailNormalized, email.trim().toLowerCase()), isNull(schema.users.deletedAt)))
    .limit(1);
  if (!user || !user.isActive) throw unauthenticated("Invalid reset code");

  const [record] = await db
    .select()
    .from(schema.passwordResetTokens)
    .where(eq(schema.passwordResetTokens.userId, user.id))
    .limit(1);
  if (!record || record.usedAt) throw unauthenticated("Invalid reset code");

  if (record.expiresAt.getTime() <= Date.now()) {
    await db.delete(schema.passwordResetTokens).where(eq(schema.passwordResetTokens.id, record.id));
    throw unauthenticated("This reset code has expired. Request a new one.");
  }

  if (!otpMatches(code, record.tokenHash)) {
    if (record.failedAttempts + 1 >= MAX_OTP_ATTEMPTS) {
      await db.delete(schema.passwordResetTokens).where(eq(schema.passwordResetTokens.id, record.id));
      throw unauthenticated("Too many incorrect attempts. Request a new reset code.");
    }
    await db
      .update(schema.passwordResetTokens)
      .set({ failedAttempts: sql`${schema.passwordResetTokens.failedAttempts} + 1` })
      .where(eq(schema.passwordResetTokens.id, record.id));
    throw unauthenticated("Invalid reset code");
  }

  await db.delete(schema.passwordResetTokens).where(eq(schema.passwordResetTokens.userId, user.id));
  return { userId: user.id };
}

/**
 * Sets a new password for the user whose reset OTP was just verified, and
 * invalidates every outstanding session by bumping the session epoch.
 */
export async function resetPassword(
  userId: string,
  newPassword: string,
  context: {
    ipAddress?: string | null;
    userAgent?: string | null;
    requestId?: string | null;
  },
): Promise<void> {
  const { db } = getDatabase();
  const [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  if (!user) throw notFound("User not found");

  const passwordHash = await hash(newPassword, ARGON2_OPTIONS);
  await db
    .update(schema.users)
    .set({
      passwordHash,
      mustChangePassword: false,
      sessionEpoch: user.sessionEpoch + 1,
    })
    .where(eq(schema.users.id, userId));

  await recordAudit(
    {
      action: "AUTH_PASSWORD_RESET",
      actorId: userId,
      actorName: user.fullName,
      actorRole: "CANDIDATE",
      entityType: "user",
      entityId: userId,
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent ?? null,
      requestId: context.requestId ?? null,
    },
  );
}
