import { validateEnv } from "./env.validation";

const VALID_ENV: Record<string, string> = {
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
    expect(result.BOLD_MODE).toBe("mock");
    expect(result.PRODUCTION_PAYMENTS_ENABLED).toBe(false);
    expect(result.BINGO_ENABLED).toBe(false);
    expect(result.BINGO_ADMIN_ENABLED).toBe(false);
    expect(result.BINGO_AFFILIATE_ENABLED).toBe(false);
    expect(result.BINGO_PUBLIC_ENABLED).toBe(false);
    expect(result.BINGO_REALTIME_ENABLED).toBe(false);
    expect(result.DATABASE_URL).toBe(VALID_ENV.DATABASE_URL);
  });

  it("coerces explicit Bingo flags and allows gradual surfaces behind the master flag", () => {
    const result = validateEnv({
      ...VALID_ENV,
      BINGO_ENABLED: "true",
      BINGO_ADMIN_ENABLED: "true",
      BINGO_AFFILIATE_ENABLED: "false",
      BINGO_PUBLIC_ENABLED: "false",
      BINGO_REALTIME_ENABLED: "true",
    });

    expect(result.BINGO_ENABLED).toBe(true);
    expect(result.BINGO_ADMIN_ENABLED).toBe(true);
    expect(result.BINGO_AFFILIATE_ENABLED).toBe(false);
    expect(result.BINGO_PUBLIC_ENABLED).toBe(false);
    expect(result.BINGO_REALTIME_ENABLED).toBe(true);
  });

  it.each([
    "BINGO_ADMIN_ENABLED",
    "BINGO_AFFILIATE_ENABLED",
    "BINGO_PUBLIC_ENABLED",
    "BINGO_REALTIME_ENABLED",
  ])("rejects %s=true while the Bingo master flag is disabled", (flag) => {
    expect(() => validateEnv({ ...VALID_ENV, [flag]: "true" })).toThrow(new RegExp(flag));
  });

  it("rejects ambiguous non-boolean Bingo flag values", () => {
    expect(() => validateEnv({ ...VALID_ENV, BINGO_ENABLED: "1" })).toThrow(/BINGO_ENABLED/);
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

  it("requires a stable identity issuer when the external HTTP core is enabled", () => {
    expect(() => validateEnv({
      ...VALID_ENV,
      EXTERNAL_CORE_PROVIDER: "http",
      EXTERNAL_IDENTITY_HMAC_KEY_ID: "v1",
      EXTERNAL_IDENTITY_HMAC_KEY: "a-dedicated-identity-hmac-key-at-least-32-characters",
      EXTERNAL_CORE_BASE_URL: "https://core.example.com",
      EXTERNAL_CORE_CLIENT_ID: "client-id",
      EXTERNAL_CORE_CLIENT_SECRET: "client-secret",
      EXTERNAL_CORE_WEBHOOK_SECRET: "webhook-secret",
    })).toThrow(/EXTERNAL_CORE_IDENTITY_ISSUER/);

    const result = validateEnv({
      ...VALID_ENV,
      EXTERNAL_CORE_PROVIDER: "http",
      EXTERNAL_CORE_IDENTITY_ISSUER: "https://identity.example.com",
      EXTERNAL_IDENTITY_HMAC_KEY_ID: "v1",
      EXTERNAL_IDENTITY_HMAC_KEY: "a-dedicated-identity-hmac-key-at-least-32-characters",
      EXTERNAL_CORE_BASE_URL: "https://core.example.com",
      EXTERNAL_CORE_CLIENT_ID: "client-id",
      EXTERNAL_CORE_CLIENT_SECRET: "client-secret",
      EXTERNAL_CORE_WEBHOOK_SECRET: "webhook-secret",
    });
    expect(result.EXTERNAL_CORE_IDENTITY_ISSUER).toBe("https://identity.example.com");
  });

  it("rejects a short external identity HMAC key when the HTTP core is enabled", () => {
    expect(() => validateEnv({
      ...VALID_ENV,
      EXTERNAL_CORE_PROVIDER: "http",
      EXTERNAL_CORE_IDENTITY_ISSUER: "https://identity.example.com",
      EXTERNAL_IDENTITY_HMAC_KEY_ID: "v1",
      EXTERNAL_IDENTITY_HMAC_KEY: "too-short",
      EXTERNAL_CORE_BASE_URL: "https://core.example.com",
      EXTERNAL_CORE_CLIENT_ID: "client-id",
      EXTERNAL_CORE_CLIENT_SECRET: "client-secret",
      EXTERNAL_CORE_WEBHOOK_SECRET: "webhook-secret",
    })).toThrow(/EXTERNAL_IDENTITY_HMAC_KEY/);
  });

  it("requires a fingerprint key id when the HTTP core is enabled", () => {
    expect(() => validateEnv({
      ...VALID_ENV,
      EXTERNAL_CORE_PROVIDER: "http",
      EXTERNAL_CORE_IDENTITY_ISSUER: "https://identity.example.com",
      EXTERNAL_IDENTITY_HMAC_KEY: "a-dedicated-identity-hmac-key-at-least-32-characters",
      EXTERNAL_CORE_BASE_URL: "https://core.example.com",
      EXTERNAL_CORE_CLIENT_ID: "client-id",
      EXTERNAL_CORE_CLIENT_SECRET: "client-secret",
      EXTERNAL_CORE_WEBHOOK_SECRET: "webhook-secret",
    })).toThrow(/EXTERNAL_IDENTITY_HMAC_KEY_ID/);
  });

  it("validates the transition keyring and forbids reusing the active key id", () => {
    const base = {
      ...VALID_ENV,
      EXTERNAL_CORE_PROVIDER: "http",
      EXTERNAL_CORE_IDENTITY_ISSUER: "https://identity.example.com",
      EXTERNAL_IDENTITY_HMAC_KEY_ID: "v2",
      EXTERNAL_IDENTITY_HMAC_KEY: "active-dedicated-identity-key-at-least-32-characters",
      EXTERNAL_CORE_BASE_URL: "https://core.example.com",
      EXTERNAL_CORE_CLIENT_ID: "client-id",
      EXTERNAL_CORE_CLIENT_SECRET: "client-secret",
      EXTERNAL_CORE_WEBHOOK_SECRET: "webhook-secret",
    };
    expect(() => validateEnv({
      ...base,
      EXTERNAL_IDENTITY_HMAC_PREVIOUS_KEYS: "not-json",
    })).toThrow(/EXTERNAL_IDENTITY_HMAC_PREVIOUS_KEYS/);
    expect(() => validateEnv({
      ...base,
      EXTERNAL_IDENTITY_HMAC_PREVIOUS_KEYS: JSON.stringify({
        v2: "different-secret-that-is-nevertheless-at-least-32-characters",
      }),
    })).toThrow(/active EXTERNAL_IDENTITY_HMAC_KEY_ID/);
    expect(validateEnv({
      ...base,
      EXTERNAL_IDENTITY_HMAC_PREVIOUS_KEYS: JSON.stringify({
        v1: "previous-dedicated-identity-key-at-least-32-characters",
      }),
    }).EXTERNAL_IDENTITY_HMAC_PREVIOUS_KEYS).toEqual({
      v1: "previous-dedicated-identity-key-at-least-32-characters",
    });
  });

  it("rejects an all-whitespace external identity issuer", () => {
    expect(() => validateEnv({
      ...VALID_ENV,
      EXTERNAL_CORE_PROVIDER: "http",
      EXTERNAL_CORE_IDENTITY_ISSUER: "   ",
      EXTERNAL_IDENTITY_HMAC_KEY_ID: "v1",
      EXTERNAL_IDENTITY_HMAC_KEY: "a-dedicated-identity-hmac-key-at-least-32-characters",
      EXTERNAL_CORE_BASE_URL: "https://core.example.com",
      EXTERNAL_CORE_CLIENT_ID: "client-id",
      EXTERNAL_CORE_CLIENT_SECRET: "client-secret",
      EXTERNAL_CORE_WEBHOOK_SECRET: "webhook-secret",
    })).toThrow(/EXTERNAL_CORE_IDENTITY_ISSUER/);
  });
});
