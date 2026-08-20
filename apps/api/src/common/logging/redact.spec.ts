import { redactObject, redactString } from "./redact";

describe("redactString", () => {
  it("scrubs embedded credentials from a postgres connection string", () => {
    const input = "connection failed: postgresql://asodef:supersecret@localhost:5433/asodef";
    const output = redactString(input);

    expect(output).not.toContain("supersecret");
    expect(output).toContain("postgresql://[REDACTED]@");
  });

  it("scrubs embedded credentials from a redis connection string", () => {
    const input = "redis://:my-redis-password@localhost:6379";
    const output = redactString(input);

    expect(output).not.toContain("my-redis-password");
    expect(output).toContain("redis://[REDACTED]@");
  });

  it("scrubs secret assignments and bearer credentials in driver errors", () => {
    const output = redactString("password=never-log token:also-secret Authorization: Bearer eyJhbGciOi.secret");

    expect(output).not.toContain("never-log");
    expect(output).not.toContain("also-secret");
    expect(output).not.toContain("eyJhbGciOi.secret");
    expect(output).toContain("[REDACTED]");
  });

  it("leaves ordinary text untouched", () => {
    expect(redactString("ASODEF API listening on port 3000")).toBe("ASODEF API listening on port 3000");
  });
});

describe("redactObject", () => {
  it("redacts top-level keys that look like secrets", () => {
    const result = redactObject({
      email: "user@example.com",
      password: "hunter2",
      passwordHash: "abc123hash",
      refreshTokenHash: "def456hash",
    }) as Record<string, unknown>;

    expect(result.email).toBe("user@example.com");
    expect(result.password).toBe("[REDACTED]");
    expect(result.passwordHash).toBe("[REDACTED]");
    expect(result.refreshTokenHash).toBe("[REDACTED]");
  });

  it("redacts sensitive keys nested inside objects and arrays", () => {
    const result = redactObject({
      users: [
        { email: "a@example.com", jwt: "eyJhbGciOi..." },
        { email: "b@example.com", jwt: "eyJhbGciOi..." },
      ],
      config: { databaseUrl: "postgresql://user:pass@host/db" },
    }) as {
      users: { email: string; jwt: string }[];
      config: { databaseUrl: string };
    };

    expect(result.users[0]?.email).toBe("a@example.com");
    expect(result.users[0]?.jwt).toBe("[REDACTED]");
    expect(result.config.databaseUrl).toBe("[REDACTED]");
  });

  it("does not choke on circular references", () => {
    const circular: Record<string, unknown> = { name: "test" };
    circular.self = circular;

    expect(() => redactObject(circular)).not.toThrow();
  });

  it("passes through non-object values unchanged", () => {
    expect(redactObject(42)).toBe(42);
    expect(redactObject(null)).toBeNull();
    expect(redactObject(true)).toBe(true);
  });
});
