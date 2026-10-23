import type { Transporter } from "nodemailer";
import { getConfig } from "../config.js";
import { getLogger } from "../lib/logger.js";

/**
 * Email delivery.
 *
 * Email is optional. When it is disabled the notification is recorded as
 * `SUPPRESSED` rather than silently dropped, so the in-app channel remains the
 * single source of truth for what the recipient was told.
 */

export interface EmailMessage {
  to: string;
  subject: string;
  body: string;
}

export interface EmailResult {
  delivered: boolean;
  error?: string;
  providerId?: string;
}

let transporter: Transporter | null = null;

async function getTransporter(): Promise<Transporter | null> {
  const config = getConfig();
  if (!config.EMAIL_ENABLED) return null;
  if (transporter) return transporter;

  const nodemailer = await import("nodemailer");
  transporter = nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_SECURE,
    ...(config.SMTP_USER && config.SMTP_PASSWORD
      ? { auth: { user: config.SMTP_USER, pass: config.SMTP_PASSWORD } }
      : {}),
  });
  return transporter;
}

export async function sendEmail(message: EmailMessage): Promise<EmailResult> {
  const config = getConfig();
  if (!config.EMAIL_ENABLED) {
    return { delivered: false, error: "Email delivery is disabled for this deployment" };
  }

  try {
    const mailer = await getTransporter();
    if (!mailer) {
      return { delivered: false, error: "No email transport is configured" };
    }
    const info = await mailer.sendMail({
      from: config.SMTP_FROM,
      to: message.to,
      subject: message.subject,
      text: message.body,
    });
    return { delivered: true, providerId: info.messageId };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    getLogger().error({ err: error, to: message.to }, "email delivery failed");
    return { delivered: false, error: detail };
  }
}
