import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
        `See backend/.env.example for the full list.`,
    );
  }
  return value;
}

function optional(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.trim() !== '' ? value : fallback;
}

function asInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Environment variable ${name} must be an integer, got: ${raw}`);
  }
  return parsed;
}

function positiveInt(name: string, fallback: number): number {
  const value = asInt(name, fallback);
  if (value <= 0) {
    throw new Error(`Environment variable ${name} must be greater than zero, got: ${value}`);
  }
  return value;
}

function asBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  return raw === '1' || raw.toLowerCase() === 'true';
}

const nodeEnv = optional('NODE_ENV', 'development');

// Refuse to start with the well-known placeholder JWT secret — it MUST be
// rotated per environment. The check is intentionally case-insensitive on
// the suffix so obvious variants are caught too.
const PLACEHOLDER_JWT_SECRETS = new Set([
  'your-super-secret-jwt-key-change-in-production',
  'change_me',
  'changeme',
  'secret',
]);

function resolveJwtSecret(): string {
  const secret = required('JWT_SECRET');
  if (secret.length < 32) {
    throw new Error(
      'JWT_SECRET must be at least 32 characters. ' +
        'Generate one with: openssl rand -base64 48',
    );
  }
  const lowered = secret.toLowerCase();
  for (const placeholder of PLACEHOLDER_JWT_SECRETS) {
    if (lowered === placeholder || lowered.includes(placeholder)) {
      throw new Error(
        'JWT_SECRET is set to a known placeholder value. ' +
          'Rotate it before starting the server.',
      );
    }
  }
  return secret;
}

const jwtSecret = resolveJwtSecret();

export const config = {
  port: asInt('PORT', 5000),
  host: optional('HOST', '0.0.0.0'),
  nodeEnv,

  database: {
    url: required('DATABASE_URL'),
  },

  jwt: {
    secret: jwtSecret,
    expiresIn: optional('JWT_EXPIRES_IN', '1h'),
  },

  frontendUrl: optional('FRONTEND_URL', 'http://localhost:3000'),

  passwordReset: {
    tokenTtlMinutes: positiveInt('PASSWORD_RESET_TOKEN_TTL_MINUTES', 30),
  },

  bcrypt: {
    saltRounds: asInt('BCRYPT_SALT_ROUNDS', 12),
  },

  // Absolute path to the uploads directory for document files
  uploadDir: path.resolve(__dirname, '../../../uploads'),

  // SMTP email transport (used by email.service.ts). All values are
  // optional in development so the server can start without mail; in
  // production SMTP_HOST/SMTP_USER/SMTP_PASS are required to send email.
  smtp: {
    host: optional('SMTP_HOST', ''),
    port: asInt('SMTP_PORT', 587),
    secure: asBool('SMTP_SECURE', false),
    user: optional('SMTP_USER', ''),
    pass: optional('SMTP_PASS', ''),
    fromName: optional('SMTP_FROM_NAME', 'DMS'),
    fromAddress: optional('SMTP_FROM', ''),
  },

  // Database seeding defaults. SEED_* values are only consumed by
  // prisma/seed.ts and should remain unset (or non-default) in production.
  seed: {
    adminPassword: optional('SEED_ADMIN_PASSWORD', ''),
    defaultUserPassword: optional('SEED_DEFAULT_USER_PASSWORD', ''),
  },

  // OCR pipeline feature flags. All default to off / safe values.
  ocr: {
    langs: optional('OCR_LANGS', 'vie+eng'),
    multipass: asBool('OCR_MULTIPASS', false),
    regionReocr: asBool('OCR_REGION_REOCR', false),
    docnumEnsemble: asBool('OCR_DOCNUM_ENSEMBLE', false),
    dateReocr: asBool('OCR_DATE_REOCR', false),
    // The signature re-OCR is on by default per the original implementation;
    // OCR_SIGNATURE_REOCR=0 disables it.
    signatureReocr: asBool('OCR_SIGNATURE_REOCR', true),
    debug: asBool('OCR_DEBUG', false),
    debugSigner: asBool('OCR_DEBUG_SIGNER', false),
  },
};
