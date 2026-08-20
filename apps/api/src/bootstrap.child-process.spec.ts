import { spawnSync } from "node:child_process";
import * as path from "node:path";

/**
 * The other bootstrap specs test the real ConfigModule/NestFactory wiring
 * in-process, but can't observe what an operator actually sees: the API
 * process itself failing to start. This spawns the real main.ts entrypoint
 * in a fresh child process with a deliberately broken environment and
 * asserts on its actual exit code and stderr output. (The "boots
 * successfully" positive case is already covered in-process in
 * bootstrap.integration.spec.ts and doesn't need this heavier treatment.)
 */
const API_ROOT = path.resolve(__dirname, "..");

const VALID_ENV_WITHOUT_DATABASE_URL: NodeJS.ProcessEnv = {
  PATH: process.env.PATH,
  NODE_ENV: "development",
  REDIS_URL: "redis://localhost:6379",
  JWT_SECRET: "child-process-test-secret-16-chars-min",
  JWT_REFRESH_SECRET: "child-process-test-refresh-secret-16-chars-min",
  ENCRYPTION_KEY: "child-process-test-encryption-key-needs-32-chars",
  ADMIN_ACCOUNT_EMAIL: "admin@asodef.com.co",
  ADMIN_RECOVERY_EMAIL: "asodefsas@gmail.com",
};

describe("main.ts entrypoint (integration, real separate process)", () => {
  it(
    "exits non-zero with a clear DATABASE_URL message when it is missing, and does not hang",
    () => {
      const result = spawnSync("npx", ["ts-node", "-r", "tsconfig-paths/register", "src/main.ts"], {
        cwd: API_ROOT,
        env: VALID_ENV_WITHOUT_DATABASE_URL,
        encoding: "utf-8",
        timeout: 20_000,
      });

      // Nest's own internal ExceptionHandler unconditionally logs a stack
      // trace for bootstrap errors (independent of abortOnError - that flag
      // only controls whether Nest calls process.exit(1) itself vs. letting
      // the promise reject). That's a server-side stderr log, not a client
      // response, so it's an acceptable operational detail. What matters:
      // main.ts's own bootstrap().catch() also runs (abortOnError: false
      // lets it), appending our own clean, redacted, single-line summary -
      // and the process still exits non-zero either way.
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("Failed to start ASODEF API");
      expect(result.stderr).toContain("DATABASE_URL");
    },
    25_000,
  );
});
