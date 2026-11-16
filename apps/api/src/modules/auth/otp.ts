import { randomInt, timingSafeEqual } from "node:crypto";
import { sha256 } from "../../lib/crypto.js";

/**
 * Shared one-time-code helpers for email verification and password reset.
 *
 * A code is always checked together with the account's email address, never
 * on its own: a 6-digit code is only unique per account, and looking codes up
 * globally would let a guess unlock whichever account happened to own it.
 */

/** Wrong guesses allowed against one code before it is destroyed. */
export const MAX_OTP_ATTEMPTS = 5;

/** A 6-digit code from a cryptographically secure source. */
export function generateOtp(): string {
  return randomInt(100000, 1000000).toString();
}

export function hashOtp(code: string): string {
  return sha256(code);
}

/** Constant-time comparison of a submitted code against the stored hash. */
export function otpMatches(code: string, storedHash: string): boolean {
  const submitted = Buffer.from(hashOtp(code), "hex");
  const stored = Buffer.from(storedHash, "hex");
  return submitted.length === stored.length && timingSafeEqual(submitted, stored);
}

/** Escapes user-supplied text before it is placed in an email's HTML. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
