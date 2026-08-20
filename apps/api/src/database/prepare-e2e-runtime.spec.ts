import { assertSafeE2EPreparation, readE2EAdminFactors } from "./prepare-e2e-runtime";

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

  it("accepts only complete ephemeral administrative factors", () => {
    expect(readE2EAdminFactors({
      ASODEF_E2E_ADMIN_PASSWORD: "ephemeral-password-material",
      ASODEF_E2E_ADMIN_MFA_SECRET: "A234567A234567A234567A234567A234",
      ASODEF_E2E_ADMIN_RECOVERY_CODES: "ABCD-EF12-3456,BCDE-F123-4567,CDEF-1234-567A,DEF2-3456-7ABC,EF23-4567-ABCD,F234-567A-BCDE,2345-67AB-CDEF,3456-7ABC-DEF2",
    })).toMatchObject({
      password: "ephemeral-password-material",
      mfaSecret: "A234567A234567A234567A234567A234",
    });

    expect(() => readE2EAdminFactors({})).toThrow("ASODEF_E2E_ADMIN_PASSWORD");
    expect(() => readE2EAdminFactors({
      ASODEF_E2E_ADMIN_PASSWORD: "ephemeral-password-material",
      ASODEF_E2E_ADMIN_MFA_SECRET: "not-base32",
      ASODEF_E2E_ADMIN_RECOVERY_CODES: "ABCD-EF12-3456",
    })).toThrow("ASODEF_E2E_ADMIN_MFA_SECRET");
  });
});
