import { eq } from "drizzle-orm";
import { getDatabase, schema } from "../../db/client.js";
import { newId, newToken } from "../../lib/ids.js";
import { sha256 } from "../../lib/crypto.js";
import { getLogger } from "../../lib/logger.js";
import { sendEmail } from "../../services/email.service.js";
import { getBooleanConfig, getNumberConfig, getStringConfig } from "../../services/config.service.js";
import { getConfig } from "../../config.js";

const VERIFICATION_BASE_URL = "https://checkiq.org";

export interface SendVerificationEmailInput {
  userId: string;
  email: string;
  fullName: string;
  candidateId?: string | null;
}

async function getResendClient() {
  const resendApiKey = await getStringConfig("resend.api_key", "");
  if (!resendApiKey) {
    // Fallback to environment variable
    const envKey = process.env.RESEND_API_KEY;
    if (!envKey) {
      getLogger().warn("No Resend API key configured");
      return null;
    }
    const { Resend } = await import("resend");
    return new Resend(envKey);
  }
  const { Resend } = await import("resend");
  return new Resend(resendApiKey);
}

/**
 * Creates a new email verification token for a user and sends the verification
 * email. Returns the verification URL.
 */
export async function sendVerificationEmail(input: SendVerificationEmailInput): Promise<string> {
  const logger = getLogger();
  const { db } = getDatabase();

  // Delete any existing tokens for this user (single-use)
  await db
    .delete(schema.emailVerificationTokens)
    .where(eq(schema.emailVerificationTokens.userId, input.userId));

  const token = newToken(32);
  const tokenHash = sha256(token);
  const ttlMinutes = await getNumberConfig("email_verification.token_ttl_minutes", 1440);
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

  const tokenId = newId();
  await db.insert(schema.emailVerificationTokens).values({
    id: tokenId,
    userId: input.userId,
    tokenHash,
    expiresAt,
  });

  const baseUrl = await getStringConfig("email_verification.base_url", VERIFICATION_BASE_URL);
  const verifyUrl = `${baseUrl}/verify-email?token=${token}`;

  const subject = "Verify your email address";
  const html = `
    <h2>Verify your email address</h2>
    <p>Hello ${input.fullName},</p>
    <p>Please verify your email address by clicking the link below:</p>
    <p><a href="${verifyUrl}">Verify your email</a></p>
    <p>This link expires in ${ttlMinutes} minutes.</p>
    <p>If you did not sign up for a CheckIQ background verification, you can ignore this email.</p>
  `;

  const resend = await getResendClient();
  let sent = false;
  if (resend) {
    const { data, error } = await resend.emails.send({
      from: getConfig().EMAIL_FROM,
      to: input.email,
      subject,
      html,
    });
    if (!error && data?.id) {
      sent = true;
      logger.info({ userId: input.userId, providerId: data.id }, "Verification email sent via Resend");
    } else {
      logger.warn({ userId: input.userId, error: error?.message }, "Resend failed, trying SMTP fallback");
    }
  }

  if (!sent) {
    // Fall back to SMTP
    const result = await sendEmail({
      to: input.email,
      subject,
      html,
    });
    if (result.delivered) {
      logger.info({ userId: input.userId }, "Verification email sent via SMTP");
    } else {
      logger.error({ userId: input.userId, error: result.error }, "Failed to send verification email");
    }
  }

  return verifyUrl;
}

export interface VerifyEmailResult {
  success: boolean;
  message: string;
}

/**
 * Verifies an email verification token.
 */
export async function verifyEmailToken(token: string): Promise<VerifyEmailResult> {
  const { db } = getDatabase();
  const tokenHash = sha256(token);

  const [record] = await db
    .select()
    .from(schema.emailVerificationTokens)
    .where(eq(schema.emailVerificationTokens.tokenHash, tokenHash))
    .limit(1);

  if (!record) {
    return { success: false, message: "Invalid verification token" };
  }

  if (record.expiresAt.getTime() <= Date.now()) {
    await db
      .delete(schema.emailVerificationTokens)
      .where(eq(schema.emailVerificationTokens.id, record.id));
    return { success: false, message: "This verification link has expired" };
  }

  // Mark email as verified
  await db
    .update(schema.users)
    .set({ isEmailVerified: true })
    .where(eq(schema.users.id, record.userId));

  // Delete used token
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
    return { sent: false, message: "If an account exists for this email, a verification link has been sent" };
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

  return { sent: true, message: "If an account exists for this email, a verification link has been sent" };
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
    throw unauthenticated("Please verify your email address before signing in. Check your inbox for a verification link, or request a new one.");
  }
}
