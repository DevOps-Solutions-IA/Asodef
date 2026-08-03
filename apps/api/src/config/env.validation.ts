import { z } from "zod";

/**
 * The single source of truth for what a valid ASODEF API environment looks
 * like. Every required variable that has no safe default (DATABASE_URL,
 * REDIS_URL, JWT_SECRET, JWT_REFRESH_SECRET, ENCRYPTION_KEY) fails fast at
 * boot with a message naming the variable - never its value, so a bad
 * secret is never echoed back into logs or terminal output.
 */
const booleanFromString = z
  .enum(["true", "false"])
  .transform((value) => value === "true");

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().int().positive().default(3000),

  APP_NAME: z.string().default("ASODEF"),
  APP_DOMAIN: z.string().default("localhost"),
  APP_TIMEZONE: z.string().default("America/Bogota"),
  PUBLIC_APP_URL: z.string().url().default("http://localhost:5173"),
  PUBLIC_API_URL: z.string().url().default("http://localhost:3000"),

  DATABASE_URL: z
    .string({ required_error: "DATABASE_URL is required" })
    .min(1, "DATABASE_URL is required")
    .regex(/^postgres(ql)?:\/\//, "DATABASE_URL must be a postgresql:// connection string"),

  REDIS_URL: z
    .string({ required_error: "REDIS_URL is required" })
    .min(1, "REDIS_URL is required")
    .regex(/^rediss?:\/\//, "REDIS_URL must be a redis:// connection string"),

  JWT_SECRET: z
    .string({ required_error: "JWT_SECRET is required" })
    .min(16, "JWT_SECRET must be at least 16 characters"),
  JWT_ACCESS_TTL: z.string().default("15m"),
  JWT_REFRESH_SECRET: z
    .string({ required_error: "JWT_REFRESH_SECRET is required" })
    .min(16, "JWT_REFRESH_SECRET must be at least 16 characters"),
  JWT_REFRESH_TTL: z.string().default("7d"),

  ENCRYPTION_KEY: z
    .string({ required_error: "ENCRYPTION_KEY is required" })
    .min(32, "ENCRYPTION_KEY must be at least 32 characters"),

  BOLD_MODE: z.enum(["mock", "live"]).default("mock"),
  BOLD_BASE_URL: z.string().url().default("https://api.online.payments.bold.co"),
  BOLD_IDENTITY_KEY: z.string().default(""),
  BOLD_SECRET_KEY: z.string().default(""),
  BOLD_WEBHOOK_SECRET: z.string().default(""),
  PRODUCTION_PAYMENTS_ENABLED: booleanFromString.default("false"),

  SMTP_HOST: z.string().default(""),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_SECURE: booleanFromString.default("false"),
  SMTP_USER: z.string().default(""),
  SMTP_PASSWORD: z.string().default(""),
  SMTP_FROM: z.string().default(""),

  // Institutional contact address - used as the notification "from" name
  // and inside email templates. Not itself proof that SMTP delivery is
  // configured/tested; see NotificationsModule's mail-transport selection.
  CORPORATE_EMAIL: z.string().email().default("info@asodef.com.co"),

  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  TRUST_PROXY: z.string().default("false"),

  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),

  // --- Auth (US-006) ---
  // Cookie names are configurable (not hardcoded) so they can be changed
  // without a code deploy; COOKIE_DOMAIN stays empty by default (no
  // explicit Domain attribute - the cookie is scoped to whatever host
  // actually served the response, which is exactly right for the
  // single-domain, path-based asodef.com.co/api architecture and needs no
  // hardcoded domain anywhere in the auth services).
  COOKIE_ACCESS_TOKEN_NAME: z.string().default("asodef_at"),
  COOKIE_REFRESH_TOKEN_NAME: z.string().default("asodef_rt"),
  COOKIE_DOMAIN: z.string().default(""),

  // OWASP-recommended argon2id minimums; the encoded hash itself carries
  // whatever parameters were used, so raising these later is detected via
  // PasswordService.needsRehash() without any migration.
  ARGON2_MEMORY_COST: z.coerce.number().int().positive().default(19456),
  ARGON2_TIME_COST: z.coerce.number().int().positive().default(2),
  ARGON2_PARALLELISM: z.coerce.number().int().positive().default(1),

  // Per-account lockout (checked against User.failedLoginAttempts/lockedUntil).
  // Upper bounds (US-009) exist specifically to reject startup
  // configuration that would make an account *effectively* permanently
  // inaccessible (e.g. a multi-year lockout duration) or so lenient it
  // stops being a meaningful control - both are configuration mistakes,
  // not values anyone would deliberately choose.
  LOGIN_MAX_FAILED_ATTEMPTS: z.coerce.number().int().positive().max(50).default(5),
  LOGIN_LOCKOUT_DURATION_MINUTES: z.coerce.number().int().positive().max(10_080).default(15), // max 7 days

  // Coarser IP-based rate limiting (Redis-backed fixed window), independent
  // of and in addition to per-account lockout - protects against
  // distributed guessing across many different email addresses.
  LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().positive().max(1_000).default(10),
  LOGIN_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().max(86_400).default(60), // max 24h window

  // --- Password recovery (US-007) ---
  // A dedicated pepper, distinct from JWT_REFRESH_SECRET, so the blast
  // radius of a leaked secret stays scoped to the token family it protects.
  PASSWORD_RESET_TOKEN_SECRET: z
    .string({ required_error: "PASSWORD_RESET_TOKEN_SECRET is required" })
    .min(16, "PASSWORD_RESET_TOKEN_SECRET must be at least 16 characters"),
  PASSWORD_RESET_TOKEN_TTL: z.string().default("1h"),

  // Centralized, configurable password policy (PasswordPolicyService).
  PASSWORD_MIN_LENGTH: z.coerce.number().int().positive().default(12),
  PASSWORD_MAX_LENGTH: z.coerce.number().int().positive().default(128),
  // How many of the user's most recent passwords (including the current
  // one) are rejected as a new password.
  PASSWORD_HISTORY_LIMIT: z.coerce.number().int().positive().default(5),

  // forgot-password is rate limited on two independent axes: by requesting
  // IP (coarse, cross-account abuse) and by a hash of the normalized email
  // (protects a single account from being flooded with reset emails from
  // many different IPs). Both fail open if Redis is unavailable, exactly
  // like LOGIN_RATE_LIMIT_*.
  FORGOT_PASSWORD_RATE_LIMIT_IP_MAX: z.coerce.number().int().positive().default(5),
  FORGOT_PASSWORD_RATE_LIMIT_IP_WINDOW_SECONDS: z.coerce.number().int().positive().default(900),
  FORGOT_PASSWORD_RATE_LIMIT_IDENTIFIER_MAX: z.coerce.number().int().positive().default(3),
  FORGOT_PASSWORD_RATE_LIMIT_IDENTIFIER_WINDOW_SECONDS: z.coerce.number().int().positive().default(900),

  // reset-password: coarse per-IP throttle on token-redemption attempts
  // (defense in depth; the token itself already has 256 bits of entropy).
  RESET_PASSWORD_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
  RESET_PASSWORD_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(900),

  // change-password: counts only *failed* current-password attempts by the
  // authenticated user's id - a correct current password never increments
  // this counter (see PasswordRecoveryService.changePassword).
  CHANGE_PASSWORD_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(5),
  CHANGE_PASSWORD_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(900),
});

export type EnvConfig = z.infer<typeof envSchema>;

/**
 * Passed as ConfigModule.forRoot({ validate }). Thrown errors surface
 * during NestFactory.create() and abort startup before the app ever binds
 * a port - see main.ts's bootstrap().catch() for how that's surfaced
 * without leaking a stack trace.
 */
export function validateEnv(config: Record<string, unknown>): EnvConfig {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}
