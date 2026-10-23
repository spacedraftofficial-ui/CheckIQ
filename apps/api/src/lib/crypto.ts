import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { getConfig } from "../config.js";

/**
 * Field-level encryption for sensitive identity values (PAN, passport number,
 * driving licence number, contact details of previous employers).
 *
 * Format: `v1:<keyId>:<iv_b64>:<authTag_b64>:<ciphertext_b64>`
 * AES-256-GCM provides confidentiality and integrity.
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const VERSION = "v1";

function deriveKey(secret: string): Buffer {
  // Accepts a hex or base64 key of >= 32 bytes, otherwise derives a 32-byte
  // key with SHA-256 so any strong passphrase works.
  if (/^[0-9a-fA-F]{64}$/.test(secret)) return Buffer.from(secret, "hex");
  if (/^[A-Za-z0-9+/]{43,}={0,2}$/.test(secret)) {
    const decoded = Buffer.from(secret, "base64");
    if (decoded.length >= 32) return decoded.subarray(0, 32);
  }
  return createHash("sha256").update(secret, "utf8").digest();
}

export function encryptSensitive(value: string): string {
  if (value === "") return "";
  const config = getConfig();
  const key = deriveKey(config.PII_ENCRYPTION_KEY);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [
    VERSION,
    config.PII_ENCRYPTION_KEY_ID,
    iv.toString("base64"),
    authTag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}

export function decryptSensitive(payload: string): string {
  if (payload === "") return "";
  const parts = payload.split(":");
  if (parts.length !== 5 || parts[0] !== VERSION) {
    throw new Error("Unsupported encrypted payload format");
  }
  const config = getConfig();
  const key = deriveKey(config.PII_ENCRYPTION_KEY);
  const iv = Buffer.from(parts[2]!, "base64");
  const authTag = Buffer.from(parts[3]!, "base64");
  const ciphertext = Buffer.from(parts[4]!, "base64");
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

/**
 * Mask a sensitive value for display. `showLast` characters remain visible so
 * a reviewer can confirm which document they are looking at.
 */
export function maskSensitive(value: string | null | undefined, showLast = 4): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length <= showLast) return "*".repeat(trimmed.length);
  return `${"*".repeat(Math.max(trimmed.length - showLast, 4))}${trimmed.slice(-showLast)}`;
}

export function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

export function constantTimeEquals(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}
