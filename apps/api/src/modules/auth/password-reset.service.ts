import { hash } from "@node-rs/argon2";
import { eq } from "drizzle-orm";
import { getDatabase, schema } from "../../db/client.js";
import { sha256 } from "../../lib/crypto.js";
import { getLogger } from "../../lib/logger.js";
import { newId } from "../../lib/ids.js";
import { sendEmail } from "../../services/email.service.js";
import { getNumberConfig } from "../../services/config.service.js";
import { recordAudit } from "../../services/audit.service.js";
import { notFound, unauthenticated } from "../../lib/errors.js";

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
  const codeHash = sha256(code);
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
    <p>Hello ${user.fullName},</p>
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
 * Verifies a single-use password reset OTP code.
 *
 * On success the token is consumed (deleted) and the user id is returned so the
 * caller can set a new password. Expired or already-used codes are rejected.
 */
export async function verifyPasswordResetOtp(
  code: string,
): Promise<VerifyPasswordResetOtpResult> {
  const { db } = getDatabase();
  const codeHash = sha256(code);

  const [record] = await db
    .select()
    .from(schema.passwordResetTokens)
    .where(eq(schema.passwordResetTokens.tokenHash, codeHash))
    .limit(1);

  if (!record) {
    throw unauthenticated("Invalid reset code");
  }

  if (record.usedAt) {
    await db
      .delete(schema.passwordResetTokens)
      .where(eq(schema.passwordResetTokens.id, record.id));
    throw unauthenticated("This reset code has already been used");
  }

  if (record.expiresAt.getTime() <= Date.now()) {
    await db
      .delete(schema.passwordResetTokens)
      .where(eq(schema.passwordResetTokens.id, record.id));
    throw unauthenticated("This reset code has expired. Request a new one.");
  }

  await db
    .delete(schema.passwordResetTokens)
    .where(eq(schema.passwordResetTokens.id, record.id));

  return { userId: record.userId };
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

function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}
