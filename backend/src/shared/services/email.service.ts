import nodemailer from 'nodemailer';
import { config } from '../../config';

/**
 * Email Service – uses Nodemailer with SMTP. All transport options are
 * resolved through the central config (backend/.env):
 *   SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS,
 *   SMTP_FROM, SMTP_FROM_NAME
 *
 * In development, leaving the SMTP_* variables blank is allowed — the
 * service can be imported without crashing. Calling sendEmail() without
 * configured credentials will throw a descriptive error.
 */

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (transporter) return transporter;
  if (!config.smtp.host || !config.smtp.user || !config.smtp.pass) {
    throw new Error(
      'SMTP is not configured. Set SMTP_HOST, SMTP_USER and SMTP_PASS in ' +
        'backend/.env before sending email.',
    );
  }
  transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: {
      user: config.smtp.user,
      pass: config.smtp.pass,
    },
  });
  return transporter;
}

export interface EmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  attachments?: Array<{
    filename: string;
    path: string;
  }>;
}

function formatFromAddress(): string {
  const address = config.smtp.fromAddress || config.smtp.user;
  if (!address) {
    throw new Error(
      'Cannot derive email sender: set SMTP_FROM or SMTP_USER in backend/.env.',
    );
  }
  if (!config.smtp.fromName) return address;
  // RFC 5322 quoted display name; keep it simple — names should not contain commas/quotes.
  const safeName = config.smtp.fromName.replace(/[",]/g, '');
  return `${safeName} <${address}>`;
}

/**
 * Send an email. Throws if SMTP is not configured or the upstream transport fails.
 */
export async function sendEmail(options: EmailOptions): Promise<void> {
  const t = getTransporter();
  await t.sendMail({
    from: formatFromAddress(),
    to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
    subject: options.subject,
    html: options.html,
    attachments: options.attachments,
  });
}
