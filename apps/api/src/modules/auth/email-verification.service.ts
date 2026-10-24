import { eq } from "drizzle-orm";
import { getDatabase, schema } from "../../db/client.js";
import { newId } from "../../lib/ids.js";
import { sha256 } from "../../lib/crypto.js";
import { getLogger } from "../../lib/logger.js";
import { sendEmail } from "../../services/email.service.js";
import { getBooleanConfig, getNumberConfig } from "../../services/config.service.js";

/**
 * Generates a 6-digit numeric OTP code for email verification.
 * The raw code is never stored — only its SHA-256 hash is persisted.
 */
function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export interface SendVerificationEmailInput {
  userId: string;
  email: string;
  fullName: string;
  candidateId?: string | null;
}

export interface SendVerificationResult {
  code: string;
  expiresAt: string;
}

/**
 * Creates a new email verification OTP for a user and sends it via email.
 * Returns the raw code and expiry (the raw code is only used in development/test
 * for convenience and is never stored).
 */
export async function sendVerificationEmail(
  input: SendVerificationEmailInput,
): Promise<SendVerificationResult> {
  const logger = getLogger();
  const { db } = getDatabase();

  // Delete any existing tokens for this user (single-use, one active code)
  await db
    .delete(schema.emailVerificationTokens)
    .where(eq(schema.emailVerificationTokens.userId, input.userId));

  const code = generateOtp();
  const codeHash = sha256(code);
  const ttlMinutes = await getNumberConfig("email_verification.token_ttl_minutes", 1440);
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

  const tokenId = newId();
  await db.insert(schema.emailVerificationTokens).values({
    id: tokenId,
    userId: input.userId,
    tokenHash: codeHash,
    expiresAt,
  });

  const subject = "Your CheckIQ verification code";
  const html = `
    <h2>Verify your email address</h2>
    <p>Hello ${input.fullName},</p>
    <p>Your verification code is:</p>
    <p style="font-size: 2rem; font-weight: bold; letter-spacing: 0.25em; margin: 1rem 0; padding: 0.5rem 1rem; background: #f5f5f5; border-radius: 8px; display: inline-block;">${code}</p>
    <p>This code expires in ${ttlMinutes} minutes.</p>
    <p>If you did not sign up for a CheckIQ background verification, you can ignore this email.</p>
  `;

  const result = await sendEmail({
    to: input.email,
    subject,
    html,
  });

  if (result.delivered) {
    logger.info({ userId: input.userId, providerId: result.providerId }, "Verification email sent");
  } else {
    logger.error({ userId: input.userId, error: result.error }, "Failed to send verification email");
  }

  return { code, expiresAt: expiresAt.toISOString() };
}

export interface VerifyEmailResult {
  success: boolean;
  message: string;
}

/**
 * Verifies a 6-digit email verification OTP code.
 * The code is single-use: once successfully verified it is deleted.
 * On failure the code record is left intact (caller can retry).
 */
export async function verifyEmailOtp(code: string): Promise<VerifyEmailResult> {
  const { db } = getDatabase();
  const codeHash = sha256(code);

  const [record] = await db
    .select()
    .from(schema.emailVerificationTokens)
    .where(eq(schema.emailVerificationTokens.tokenHash, codeHash))
    .limit(1);

  if (!record) {
    return { success: false, message: "Invalid verification code" };
  }

  if (record.expiresAt.getTime() <= Date.now()) {
    await db
      .delete(schema.emailVerificationTokens)
      .where(eq(schema.emailVerificationTokens.id, record.id));
    return { success: false, message: "This verification code has expired. Request a new one." };
  }

  await db
    .update(schema.users)
    .set({ isEmailVerified: true })
    .where(eq(schema.users.id, record.userId));

  await db
    .delete(schema.emailVerificationTokens)
    .where(eq(schema.emailVerificationTokens.id, record.id));

  return { success: true, message: "Email verified successfully" };
}

/**
 * Resends a verification email to the user with the given email.
 */
export async function resendVerificationEmail(email: string): Promise<{ sent: boolean; message: string }> {
  const { db } = getDatabase();
  const emailNormalized = email.trim().toLowerCase();
  const verificationEnabled = await getBooleanConfig("email_verification.enabled", true);

  if (!verificationEnabled) {
    return { sent: false, message: "Email verification is not enabled" };
  }

  const [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.emailNormalized, emailNormalized))
    .limit(1);

  if (!user) {
    return { sent: false, message: "If an account exists for this email, a verification code has been sent" };
  }

  if (user.isEmailVerified) {
    return { sent: false, message: "This email address is already verified" };
  }

  // Check if admin/staff - they shouldn't need verification
  const adminVerificationRequired = await getBooleanConfig("auth.admin_requires_verification", false);

  if (!adminVerificationRequired) {
    const [staffRole] = await db
      .select({ code: schema.userRoles.roleCode })
      .from(schema.userRoles)
      .where(eq(schema.userRoles.userId, user.id))
      .limit(1);

    if (staffRole && staffRole.code !== "CANDIDATE") {
      return { sent: false, message: "Staff accounts do not require email verification" };
    }
  }

  const [profile] = await db
    .select({ candidateId: schema.candidateProfiles.candidateId })
    .from(schema.candidateProfiles)
    .where(eq(schema.candidateProfiles.userId, user.id))
    .limit(1);

  await sendVerificationEmail({
    userId: user.id,
    email: user.email,
    fullName: user.fullName,
    candidateId: profile?.candidateId ?? null,
  });

  return { sent: true, message: "If an account exists for this email, a verification code has been sent" };
}

/**
 * Checks if a user should be blocked from login due to unverified email.
 * Staff/admin accounts are never blocked; only candidates when verification
 * is enabled.
 */
export async function checkEmailVerificationRequired(userId: string, roles: string[]): Promise<void> {
  const verificationEnabled = await getBooleanConfig("email_verification.enabled", true);
  if (!verificationEnabled) return;

  const isAdmin = roles.some((r) => r === "ADMINISTRATOR" || r === "SUPER_ADMINISTRATOR");
  if (isAdmin) return;

  const { db } = getDatabase();
  const [user] = await db
    .select({ isEmailVerified: schema.users.isEmailVerified })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);

  if (user && !user.isEmailVerified) {
    const { unauthenticated } = await import("../../lib/errors.js");
    throw unauthenticated("Please verify your email address before signing in. Check your inbox for a verification code, or request a new one.");
  }
}
