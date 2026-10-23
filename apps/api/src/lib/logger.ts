import { pino } from "pino";
import { getConfig } from "../config.js";

/**
 * Structured logger.
 *
 * Redaction is configured so that passwords, tokens, OTP values and sensitive
 * identity numbers can never reach the log sink, even if a caller passes them
 * into a log call by mistake.
 */
const redactPaths = [
  "req.headers.authorization",
  "req.headers.cookie",
  "req.headers[\"set-cookie\"]",
  "res.headers[\"set-cookie\"]",
  "password",
  "confirmPassword",
  "currentPassword",
  "newPassword",
  "token",
  "refreshToken",
  "accessToken",
  "otp",
  "otpCode",
  "pan",
  "panEncrypted",
  "passportNumber",
  "passportNumberEncrypted",
  "drivingLicenceNumberEncrypted",
  "body.password",
  "body.confirmPassword",
  "body.currentPassword",
  "body.newPassword",
  "body.pan",
  "body.passportNumber",
  "body.drivingLicenceNumber",
  "*.password",
  "*.pan",
  "*.panEncrypted",
];

export function createLogger() {
  const config = getConfig();
  return pino({
    level: config.LOG_LEVEL,
    redact: { paths: redactPaths, censor: "[REDACTED]" },
    base: { service: "checkiq-api", env: config.NODE_ENV },
    timestamp: pino.stdTimeFunctions.isoTime,
  });
}

export type Logger = ReturnType<typeof createLogger>;

let logger: Logger | undefined;

export function getLogger(): Logger {
  if (!logger) logger = createLogger();
  return logger;
}
