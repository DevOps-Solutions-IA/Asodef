import { assertSafeE2EPreparation } from "./prepare-e2e-runtime";

describe("assertSafeE2EPreparation", () => {
  const localDatabase = "postgresql://test:test@127.0.0.1:55433/asodef_ci?schema=public";

  it("allows only an explicit CI/E2E request against a local database", () => {
    expect(() => assertSafeE2EPreparation({ NODE_ENV: "test", CI: "true", DATABASE_URL: localDatabase })).not.toThrow();
    expect(() => assertSafeE2EPreparation({ NODE_ENV: "test", ASODEF_E2E_PREPARE: "true", DATABASE_URL: localDatabase })).not.toThrow();
  });

  it("fails closed for production, implicit execution, and non-local databases", () => {
    expect(() => assertSafeE2EPreparation({ NODE_ENV: "production", CI: "true", DATABASE_URL: localDatabase })).toThrow("forbidden in production");
    expect(() => assertSafeE2EPreparation({ NODE_ENV: "test", DATABASE_URL: localDatabase })).toThrow("requires CI=true");
    expect(() => assertSafeE2EPreparation({ NODE_ENV: "test", CI: "true", DATABASE_URL: "postgresql://test:test@db.example.com/asodef" })).toThrow("local isolated database");
  });
});
