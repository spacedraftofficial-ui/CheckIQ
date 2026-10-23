import type { Transporter } from "nodemailer";
import { Resend } from "resend";
import { getConfig } from "../config.js";
import { getLogger } from "../lib/logger.js";

/**
 * Email delivery.
 *
 * Email is optional. When it is disabled the notification is recorded as
 * `SUPPRESSED` rather than silently dropped, so the in-app channel remains the
 * single source of truth for what the recipient was told.
 *
 * Delivery order: Resend API first (if RESEND_API_KEY is set), then SMTP
 * (if SMTP_HOST is set).
 */

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
}

export interface EmailResult {
  delivered: boolean;
  error?: string;
  providerId?: string;
}

let resendClient: Resend | null = null;
let nodemailerTransporter: Transporter | null = null;

function getResendClient(): Resend | null {
  const config = getConfig();
  if (!config.RESEND_API_KEY) return null;
  if (resendClient) return resendClient;

  resendClient = new Resend(config.RESEND_API_KEY);
  return resendClient;
}

async function getTransporter(): Promise<Transporter | null> {
  const config = getConfig();
  if (!config.SMTP_HOST) return null;
  if (nodemailerTransporter) return nodemailerTransporter;

  const nodemailer = await import("nodemailer");
  nodemailerTransporter = nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_SECURE,
    ...(config.SMTP_USER && config.SMTP_PASSWORD
      ? { auth: { user: config.SMTP_USER, pass: config.SMTP_PASSWORD } }
      : {}),
  });
  return nodemailerTransporter;
}

export async function sendEmail(message: EmailMessage): Promise<EmailResult> {
  const config = getConfig();
  if (!config.EMAIL_ENABLED) {
    return { delivered: false, error: "Email delivery is disabled for this deployment" };
  }

  // Try Resend first
  const resend = getResendClient();
  if (resend) {
    try {
      const { data, error } = await resend.emails.send({
        from: config.EMAIL_FROM,
        to: message.to,
        subject: message.subject,
        html: message.html,
      });

      if (error) {
        return { delivered: false, error: error.message };
      }

      return { delivered: true, providerId: data?.id };
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      getLogger().error({ err, to: message.to }, "resend email delivery failed");
      return { delivered: false, error: detail };
    }
  }

  // Fall back to SMTP
  const mailer = await getTransporter();
  if (!mailer) {
    return { delivered: false, error: "No email transport is configured" };
  }

  try {
    const info = await mailer.sendMail({
      from: config.EMAIL_FROM,
      to: message.to,
      subject: message.subject,
      html: message.html,
    });
    return { delivered: true, providerId: info.messageId };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    getLogger().error({ err: error, to: message.to }, "smtp email delivery failed");
    return { delivered: false, error: detail };
  }
}
