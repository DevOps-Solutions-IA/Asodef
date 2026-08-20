import { AppLogger } from "./app-logger.service";

describe("AppLogger", () => {
  let consoleLogSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  it("emits a single JSON line in production mode", () => {
    const logger = new AppLogger(true);
    logger.log("service started", "Bootstrap");

    expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    const output = consoleLogSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(output);
    expect(parsed).toMatchObject({ level: "log", context: "Bootstrap", message: "service started" });
    expect(typeof parsed.timestamp).toBe("string");
  });

  it("emits human-readable text in development mode", () => {
    const logger = new AppLogger(false);
    logger.log("service started", "Bootstrap");

    const output = consoleLogSpy.mock.calls[0][0] as string;
    expect(output).toContain("LOG");
    expect(output).toContain("[Bootstrap]");
    expect(output).toContain("service started");
    expect(() => JSON.parse(output)).toThrow();
  });

  it("redacts a connection string embedded in a plain string message", () => {
    const logger = new AppLogger(true);
    logger.error("Failed to start ASODEF API:\npostgresql://asodef:supersecret@localhost:5433/asodef");

    const output = consoleLogSpy.mock.calls[0][0] as string;
    expect(output).not.toContain("supersecret");
  });

  it("redacts sensitive keys when the message is an object", () => {
    const logger = new AppLogger(true);
    logger.log({ email: "user@example.com", password: "hunter2" });

    const parsed = JSON.parse(consoleLogSpy.mock.calls[0][0] as string);
    expect(parsed.message.email).toBe("user@example.com");
    expect(parsed.message.password).toBe("[REDACTED]");
  });

  it("omits the stack trace from production log output", () => {
    const logger = new AppLogger(true);
    logger.error("boom", "Error: boom\n    at somewhere.ts:1:1");

    const parsed = JSON.parse(consoleLogSpy.mock.calls[0][0] as string);
    expect(parsed.trace).toBeUndefined();
  });

  it("includes the stack trace in development log output for debuggability", () => {
    const logger = new AppLogger(false);
    logger.error("boom", "Error: boom\n    at somewhere.ts:1:1");

    const calls = consoleLogSpy.mock.calls.map((call) => call[0] as string);
    expect(calls.some((line) => line.includes("at somewhere.ts:1:1"))).toBe(true);
  });

  it("redacts credentials embedded in a development stack trace", () => {
    const logger = new AppLogger(false);
    logger.error("dependency failure", "Error: postgresql://user:never-log-me@database.invalid/app\n    at driver.ts:1:1");

    const output = consoleLogSpy.mock.calls.map((call) => String(call[0])).join("\n");
    expect(output).not.toContain("never-log-me");
    expect(output).toContain("postgresql://[REDACTED]@");
  });
});
