import { z } from "zod";

/**
 * Environment configuration.
 *
 * Every deployment-specific value is read from the environment. Secrets are
 * never committed, never logged and never returned through the API.
 */

const booleanFromString = z
  .union([z.boolean(), z.enum(["true", "false"])])
  .transform((value) => (typeof value === "boolean" ? value : value === "true"));

/** Public, committed default. Never acceptable for a production administrator. */
export const DEFAULT_SEED_ADMIN_PASSWORD = "ChangeMe!2026";

const csv = z
  .string()
  .optional()
  .transform((v) =>
    v === undefined
      ? []
      : v
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s.length > 0),
  );

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  HOST: z.string().default("127.0.0.1"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  /** Unset = decide automatically (see trustProxyEnabled). */
  TRUST_PROXY: booleanFromString.optional(),

  DATABASE_URL: z.string().min(1, { error: "DATABASE_URL is required" }),
  DATABASE_POOL_SIZE: z.coerce.number().int().min(1).max(50).default(10),

  JWT_ACCESS_SECRET: z.string().min(32, { error: "JWT_ACCESS_SECRET must be at least 32 characters" }),
  JWT_ISSUER: z.string().default("checkiq"),
  JWT_AUDIENCE: z.string().default("checkiq-web"),
  ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().min(1).max(1440).default(15),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(7),

  PII_ENCRYPTION_KEY: z.string().min(32, { error: "PII_ENCRYPTION_KEY must be at least 32 characters" }),
  PII_ENCRYPTION_KEY_ID: z.string().default("local-dev-1"),

  STORAGE_DIR: z.string().default("./storage"),
  UPLOAD_MAX_FILE_BYTES: z.coerce.number().int().min(1024).default(10 * 1024 * 1024),
  UPLOAD_MAX_FILES_PER_REQUEST: z.coerce.number().int().min(1).max(50).default(10),

  CORS_ORIGINS: csv,
  COOKIE_SECURE: booleanFromString.default(false),
  COOKIE_DOMAIN: z.string().optional(),

  EMAIL_ENABLED: booleanFromString.default(false),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default("CheckIQ <no-reply@checkiq.org>"),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  SMTP_SECURE: booleanFromString.default(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().default("CheckIQ <no-reply@checkiq.local>"),

  SUPPORT_CONTACT_EMAIL: z.string().optional(),

  RATE_LIMIT_WINDOW_MINUTES: z.coerce.number().int().min(1).default(15),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().min(1).default(300),
  AUTH_RATE_LIMIT_MAX_ATTEMPTS: z.coerce.number().int().min(1).default(10),
  SIGNUP_RATE_LIMIT_MAX_ATTEMPTS: z.coerce.number().int().min(1).default(5),

  SEED_ADMIN_EMAIL: z.string().default("admin@checkiq.local"),
  SEED_ADMIN_PASSWORD: z.string().default(DEFAULT_SEED_ADMIN_PASSWORD),
  SEED_ADMIN_NAME: z.string().default("System Administrator"),
  EMAIL_VERIFICATION_TTL_MINUTES: z.coerce.number().int().min(1).max(1440).default(1440),
});

export type AppConfig = z.infer<typeof envSchema>;

/**
 * Whether Express should trust one reverse-proxy hop for the client address.
 *
 * Hostinger runs the app behind its proxy; without trusting it every visitor
 * shares the proxy's address and therefore one rate-limit bucket, so a few
 * signups by anyone would lock out everyone. An explicit TRUST_PROXY wins;
 * when it is unset, the proxy is trusted on Hostinger only (elsewhere,
 * trusting a proxy that is not there would let clients spoof their address).
 */
export function trustProxyEnabled(
  configured: boolean | undefined,
  hostingerSourceDir: string | undefined,
): boolean {
  return configured ?? Boolean(hostingerSourceDir);
}

/**
 * The seeded administrator is created with SEED_ADMIN_PASSWORD. In production
 * that must not be the committed default: whoever signs in first with it would
 * own a Super Administrator account.
 */
export function seedAdminPasswordAllowed(nodeEnv: string, password: string): boolean {
  return nodeEnv !== "production" || (password !== DEFAULT_SEED_ADMIN_PASSWORD && password.length >= 12);
}

function loadEnvFile(): void {
  // Node's built-in .env loader. No third-party dotenv dependency.
  // Candidates are tried in order; the first readable file wins. Values already
  // present in the process environment are never overwritten.
  const candidates: (string | undefined)[] = [
    undefined,
    "../../.env",
    "../.env",
    process.env.HOSTINGER_SOURCE_DIR
      ? `${process.env.HOSTINGER_SOURCE_DIR}/.env`
      : undefined,
  ];

  for (const candidate of candidates) {
    try {
      if (candidate === undefined) process.loadEnvFile();
      else process.loadEnvFile(candidate);
      return;
    } catch {
      // Try the next candidate.
    }
  }
}

let cached: AppConfig | undefined;

export function getConfig(): AppConfig {
  if (cached) return cached;
  loadEnvFile();
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  if (cached.NODE_ENV === "production" && !cached.COOKIE_SECURE) {
    // Log a warning but don't block startup. Hostinger single-site deployments
    // may not have HTTPS configured, so COOKIE_SECURE=false is sometimes valid.
    console.warn(
      "[warn] COOKIE_SECURE is not set to true in production. For HTTPS deployments, set COOKIE_SECURE=true.",
    );
  }
  if (cached.NODE_ENV === "production") {
    // Not fatal (in-app notifications still work), but without email new
    // candidates never receive their verification code and cannot sign in.
    if (!cached.EMAIL_ENABLED) {
      console.warn("[warn] EMAIL_ENABLED is false: verification and password reset codes will NOT be emailed.");
    } else if (!cached.RESEND_API_KEY && !cached.SMTP_HOST) {
      console.warn("[warn] EMAIL_ENABLED is true but neither RESEND_API_KEY nor SMTP_HOST is set: no email can be sent.");
    }
  }
  return cached;
}

