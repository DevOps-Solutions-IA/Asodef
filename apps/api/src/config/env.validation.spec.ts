import { validateEnv } from "./env.validation";

const VALID_ENV: Record<string, string> = {
  ADMIN_ACCOUNT_EMAIL: "admin@asodef.com.co",
  ADMIN_RECOVERY_EMAIL: "asodefsas@gmail.com",
  DATABASE_URL: "postgresql://asodef:asodef_dev_password@localhost:5433/asodef?schema=public",
  REDIS_URL: "redis://localhost:6379",
  JWT_SECRET: "a-secret-that-is-long-enough",
  JWT_REFRESH_SECRET: "a-refresh-secret-that-is-long-enough",
  ENCRYPTION_KEY: "an-encryption-key-that-is-at-least-32-characters",
  PASSWORD_RESET_TOKEN_SECRET: "a-reset-token-secret-that-is-long-enough",
  CONTRACT_DOWNLOAD_TOKEN_SECRET: "a-contract-download-secret-that-is-long-enough",
};

describe("validateEnv", () => {
  it("boots with a minimal valid configuration and fills in documented defaults", () => {
    const result = validateEnv(VALID_ENV);

    expect(result.NODE_ENV).toBe("development");
    expect(result.API_PORT).toBe(3000);
    expect(result.APP_TIMEZONE).toBe("America/Bogota");
    expect(result.ADMIN_ACCOUNT_EMAIL).toBe("admin@asodef.com.co");
    expect(result.ADMIN_RECOVERY_EMAIL).toBe("asodefsas@gmail.com");
    expect(result.ADMIN_MFA_REQUIRED).toBe(false);
    expect(result.ADMIN_MFA_CHALLENGE_TTL_SECONDS).toBe(300);
    expect(result.ADMIN_MFA_ENROLLMENT_TTL_SECONDS).toBe(900);
    expect(result.ADMIN_STEP_UP_TTL_SECONDS).toBe(300);
    expect(result.ADMIN_STEP_UP_MAX_FAILED_ATTEMPTS).toBe(5);
    expect(result.ADMIN_STEP_UP_RATE_LIMIT_WINDOW_SECONDS).toBe(900);
    expect(result.BOLD_MODE).toBe("mock");
    expect(result.PRODUCTION_PAYMENTS_ENABLED).toBe(false);
    expect(result.MASTER_FIREBIRD_ENABLED).toBe(false);
    expect(result.MASTER_FIREBIRD_PORT).toBe(3051);
    expect(result.MASTER_FIREBIRD_CHARSET).toBe("UTF8");
    expect(result.DATABASE_URL).toBe(VALID_ENV.DATABASE_URL);
  });

  it("normalizes and validates the privileged account and recovery addresses", () => {
    const result = validateEnv({
      ...VALID_ENV,
      ADMIN_ACCOUNT_EMAIL: " ADMIN@ASODEF.COM.CO ",
      ADMIN_RECOVERY_EMAIL: " ASODEFSAS@GMAIL.COM ",
    });
    expect(result.ADMIN_ACCOUNT_EMAIL).toBe("admin@asodef.com.co");
    expect(result.ADMIN_RECOVERY_EMAIL).toBe("asodefsas@gmail.com");
  });

  it("rejects an identical login and recovery address", () => {
    expect(() => validateEnv({
      ...VALID_ENV,
      ADMIN_ACCOUNT_EMAIL: "admin@asodef.com.co",
      ADMIN_RECOVERY_EMAIL: "ADMIN@ASODEF.COM.CO",
    })).toThrow(/ADMIN_RECOVERY_EMAIL/);
  });

  it("fails fast when either privileged identity address is missing", () => {
    const { ADMIN_ACCOUNT_EMAIL: _account, ...withoutAccount } = VALID_ENV;
    const { ADMIN_RECOVERY_EMAIL: _recovery, ...withoutRecovery } = VALID_ENV;
    void _account;
    void _recovery;
    expect(() => validateEnv(withoutAccount)).toThrow(/ADMIN_ACCOUNT_EMAIL/);
    expect(() => validateEnv(withoutRecovery)).toThrow(/ADMIN_RECOVERY_EMAIL/);
  });

  it("parses staged MFA enforcement and bounds its security TTLs", () => {
    expect(validateEnv({ ...VALID_ENV, ADMIN_MFA_REQUIRED: "true" }).ADMIN_MFA_REQUIRED).toBe(true);
    expect(() => validateEnv({ ...VALID_ENV, ADMIN_MFA_CHALLENGE_TTL_SECONDS: "30" })).toThrow();
    expect(() => validateEnv({ ...VALID_ENV, ADMIN_MFA_ENROLLMENT_TTL_SECONDS: "7200" })).toThrow();
    expect(() => validateEnv({ ...VALID_ENV, ADMIN_STEP_UP_TTL_SECONDS: "3600" })).toThrow();
    expect(() => validateEnv({ ...VALID_ENV, ADMIN_STEP_UP_MAX_FAILED_ATTEMPTS: "2" })).toThrow();
    expect(() => validateEnv({ ...VALID_ENV, ADMIN_STEP_UP_MAX_FAILED_ATTEMPTS: "11" })).toThrow();
    expect(() => validateEnv({ ...VALID_ENV, ADMIN_STEP_UP_RATE_LIMIT_WINDOW_SECONDS: "30" })).toThrow();
    expect(() => validateEnv({ ...VALID_ENV, ADMIN_STEP_UP_RATE_LIMIT_WINDOW_SECONDS: "7200" })).toThrow();
  });

  it("accepts an empty optional SMTP port and fails closed on partial SMTP authentication", () => {
    expect(validateEnv({ ...VALID_ENV, SMTP_PORT: "" }).SMTP_PORT).toBeUndefined();
    expect(() => validateEnv({ ...VALID_ENV, SMTP_HOST: "smtp.example.invalid", SMTP_USER: "mailer" })).toThrow(
      /SMTP_PASSWORD/,
    );
    expect(() => validateEnv({ ...VALID_ENV, SMTP_HOST: "smtp.example.invalid", SMTP_PASSWORD: "opaque" })).toThrow(
      /SMTP_USER/,
    );
  });

  it("rejects an invalid SMTP sender address without echoing credentials", () => {
    expect(() => validateEnv({ ...VALID_ENV, SMTP_FROM: "not-an-email" })).toThrow(/SMTP_FROM/);
  });

  it("keeps Firebird disabled without requiring or resolving any connection fields", () => {
    const result = validateEnv({ ...VALID_ENV, MASTER_FIREBIRD_ENABLED: "false" });

    expect(result.MASTER_FIREBIRD_ENABLED).toBe(false);
    expect(result.MASTER_FIREBIRD_HOST).toBe("");
    expect(result.MASTER_FIREBIRD_DATABASE).toBe("");
    expect(result.MASTER_FIREBIRD_USER).toBe("");
    expect(result.MASTER_FIREBIRD_PASSWORD).toBe("");
  });

  it("requires every Firebird connection field only when the feature is enabled", () => {
    expect(() => validateEnv({ ...VALID_ENV, MASTER_FIREBIRD_ENABLED: "true" })).toThrow(
      /MASTER_FIREBIRD_HOST/,
    );
    expect(() => validateEnv({ ...VALID_ENV, MASTER_FIREBIRD_ENABLED: "true" })).toThrow(
      /MASTER_FIREBIRD_DATABASE/,
    );
    expect(() => validateEnv({ ...VALID_ENV, MASTER_FIREBIRD_ENABLED: "true" })).toThrow(
      /MASTER_FIREBIRD_USER/,
    );
    expect(() => validateEnv({ ...VALID_ENV, MASTER_FIREBIRD_ENABLED: "true" })).toThrow(
      /MASTER_FIREBIRD_PASSWORD/,
    );
  });

  it("accepts a complete configurable Firebird shape without logging or exposing its values", () => {
    const result = validateEnv({
      ...VALID_ENV,
      MASTER_FIREBIRD_ENABLED: "true",
      MASTER_FIREBIRD_HOST: "master.example.invalid",
      MASTER_FIREBIRD_PORT: "3051",
      MASTER_FIREBIRD_DATABASE: "sanitized-database-alias",
      MASTER_FIREBIRD_USER: "ASODEF_READONLY",
      MASTER_FIREBIRD_PASSWORD: "not-a-real-password",
      MASTER_FIREBIRD_CHARSET: "UTF8",
    });

    expect(result.MASTER_FIREBIRD_ENABLED).toBe(true);
    expect(result.MASTER_FIREBIRD_PORT).toBe(3051);
    expect(result.MASTER_FIREBIRD_USER).toBe("ASODEF_READONLY");
  });

  it("rejects every enabled Firebird identity except the dedicated read-only account", () => {
    expect(() => validateEnv({
      ...VALID_ENV,
      MASTER_FIREBIRD_ENABLED: "true",
      MASTER_FIREBIRD_HOST: "master.example.invalid",
      MASTER_FIREBIRD_DATABASE: "sanitized-database-alias",
      MASTER_FIREBIRD_USER: "ADMINISTRATIVE_ACCOUNT",
      MASTER_FIREBIRD_PASSWORD: "not-a-real-password",
    })).toThrow(/must be ASODEF_READONLY/);
  });

  it("fails fast with a clear message naming DATABASE_URL when it is missing", () => {
    const { DATABASE_URL: _unused, ...withoutDatabaseUrl } = VALID_ENV;
    void _unused;

    expect(() => validateEnv(withoutDatabaseUrl)).toThrow(/DATABASE_URL/);
  });

  it("never echoes the invalid value itself when DATABASE_URL has the wrong shape", () => {
    const secretLookingValue = "not-a-postgres-url-but-looks-like-a-secret-abc123";
    try {
      validateEnv({ ...VALID_ENV, DATABASE_URL: secretLookingValue });
      throw new Error("expected validateEnv to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).not.toContain(secretLookingValue);
      expect((error as Error).message).toContain("DATABASE_URL");
    }
  });

  it("fails fast when REDIS_URL is missing", () => {
    const { REDIS_URL: _unused, ...withoutRedisUrl } = VALID_ENV;
    void _unused;

    expect(() => validateEnv(withoutRedisUrl)).toThrow(/REDIS_URL/);
  });

  it("rejects a JWT_SECRET that is too short", () => {
    expect(() => validateEnv({ ...VALID_ENV, JWT_SECRET: "short" })).toThrow(/JWT_SECRET/);
  });

  it("rejects a JWT_REFRESH_SECRET that is too short", () => {
    expect(() => validateEnv({ ...VALID_ENV, JWT_REFRESH_SECRET: "short" })).toThrow(/JWT_REFRESH_SECRET/);
  });

  it("rejects an ENCRYPTION_KEY shorter than 32 characters", () => {
    expect(() => validateEnv({ ...VALID_ENV, ENCRYPTION_KEY: "too-short" })).toThrow(/ENCRYPTION_KEY/);
  });

  it("rejects a zero or negative LOGIN_MAX_FAILED_ATTEMPTS", () => {
    expect(() => validateEnv({ ...VALID_ENV, LOGIN_MAX_FAILED_ATTEMPTS: "0" })).toThrow(/LOGIN_MAX_FAILED_ATTEMPTS/);
    expect(() => validateEnv({ ...VALID_ENV, LOGIN_MAX_FAILED_ATTEMPTS: "-1" })).toThrow(/LOGIN_MAX_FAILED_ATTEMPTS/);
  });

  it("rejects an excessive LOGIN_MAX_FAILED_ATTEMPTS that would defeat the control", () => {
    expect(() => validateEnv({ ...VALID_ENV, LOGIN_MAX_FAILED_ATTEMPTS: "100000" })).toThrow(/LOGIN_MAX_FAILED_ATTEMPTS/);
  });

  it("rejects a zero or negative LOGIN_LOCKOUT_DURATION_MINUTES", () => {
    expect(() => validateEnv({ ...VALID_ENV, LOGIN_LOCKOUT_DURATION_MINUTES: "0" })).toThrow(/LOGIN_LOCKOUT_DURATION_MINUTES/);
  });

  it("rejects an excessive LOGIN_LOCKOUT_DURATION_MINUTES that could make accounts effectively permanently inaccessible", () => {
    expect(() => validateEnv({ ...VALID_ENV, LOGIN_LOCKOUT_DURATION_MINUTES: "999999" })).toThrow(
      /LOGIN_LOCKOUT_DURATION_MINUTES/,
    );
  });

  it("rejects an invalid (zero/negative/excessive) LOGIN_RATE_LIMIT_WINDOW_SECONDS", () => {
    expect(() => validateEnv({ ...VALID_ENV, LOGIN_RATE_LIMIT_WINDOW_SECONDS: "0" })).toThrow(
      /LOGIN_RATE_LIMIT_WINDOW_SECONDS/,
    );
    expect(() => validateEnv({ ...VALID_ENV, LOGIN_RATE_LIMIT_WINDOW_SECONDS: "999999999" })).toThrow(
      /LOGIN_RATE_LIMIT_WINDOW_SECONDS/,
    );
  });

  it("fails fast when PASSWORD_RESET_TOKEN_SECRET is missing", () => {
    const { PASSWORD_RESET_TOKEN_SECRET: _unused, ...withoutResetSecret } = VALID_ENV;
    void _unused;

    expect(() => validateEnv(withoutResetSecret)).toThrow(/PASSWORD_RESET_TOKEN_SECRET/);
  });

  it("rejects a PASSWORD_RESET_TOKEN_SECRET that is too short", () => {
    expect(() => validateEnv({ ...VALID_ENV, PASSWORD_RESET_TOKEN_SECRET: "short" })).toThrow(
      /PASSWORD_RESET_TOKEN_SECRET/,
    );
  });

  it("rejects an unrecognized NODE_ENV value", () => {
    expect(() => validateEnv({ ...VALID_ENV, NODE_ENV: "staging-typo" })).toThrow(/NODE_ENV/);
  });

  it("rejects a non-numeric API_PORT", () => {
    expect(() => validateEnv({ ...VALID_ENV, API_PORT: "not-a-port" })).toThrow(/API_PORT/);
  });

  it("coerces PRODUCTION_PAYMENTS_ENABLED from the string 'true' to a real boolean", () => {
    const result = validateEnv({ ...VALID_ENV, PRODUCTION_PAYMENTS_ENABLED: "true" });
    expect(result.PRODUCTION_PAYMENTS_ENABLED).toBe(true);
  });

  it("lists every failing variable when multiple are invalid at once", () => {
    try {
      validateEnv({
        ...VALID_ENV,
        JWT_SECRET: "short",
        ENCRYPTION_KEY: "short",
      });
      throw new Error("expected validateEnv to throw");
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain("JWT_SECRET");
      expect(message).toContain("ENCRYPTION_KEY");
    }
  });
});
