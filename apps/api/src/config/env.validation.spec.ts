import { validateEnv } from "./env.validation";

const VALID_ENV: Record<string, string> = {
  DATABASE_URL: "postgresql://asodef:asodef_dev_password@localhost:5433/asodef?schema=public",
  REDIS_URL: "redis://localhost:6379",
  JWT_SECRET: "a-secret-that-is-long-enough",
  JWT_REFRESH_SECRET: "a-refresh-secret-that-is-long-enough",
  ENCRYPTION_KEY: "an-encryption-key-that-is-at-least-32-characters",
  PASSWORD_RESET_TOKEN_SECRET: "a-reset-token-secret-that-is-long-enough",
};

describe("validateEnv", () => {
  it("boots with a minimal valid configuration and fills in documented defaults", () => {
    const result = validateEnv(VALID_ENV);

    expect(result.NODE_ENV).toBe("development");
    expect(result.API_PORT).toBe(3000);
    expect(result.APP_TIMEZONE).toBe("America/Bogota");
    expect(result.BOLD_MODE).toBe("mock");
    expect(result.PRODUCTION_PAYMENTS_ENABLED).toBe(false);
    expect(result.DATABASE_URL).toBe(VALID_ENV.DATABASE_URL);
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
