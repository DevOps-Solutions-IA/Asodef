import {
  MasterReadOnlyGateConfigurationError,
  validateMasterReadOnlyGateEnvironment,
} from "./master-read-only-gate.config";

const validEnvironment = {
  MASTER_FIREBIRD_ENABLED: "true",
  MASTER_FIREBIRD_HOST: "private-master.internal",
  MASTER_FIREBIRD_DATABASE: "MASTER_ALIAS",
  MASTER_FIREBIRD_USER: "ASODEF_READONLY",
  MASTER_FIREBIRD_PASSWORD: "runtime-only-secret",
};

describe("validateMasterReadOnlyGateEnvironment", () => {
  it("accepts only Master configuration without unrelated API variables", () => {
    expect(validateMasterReadOnlyGateEnvironment(validEnvironment)).toEqual({
      MASTER_FIREBIRD_ENABLED: true,
      MASTER_FIREBIRD_HOST: "private-master.internal",
      MASTER_FIREBIRD_PORT: 3051,
      MASTER_FIREBIRD_DATABASE: "MASTER_ALIAS",
      MASTER_FIREBIRD_USER: "ASODEF_READONLY",
      MASTER_FIREBIRD_PASSWORD: "runtime-only-secret",
      MASTER_FIREBIRD_CHARSET: "UTF8",
      MASTER_FIREBIRD_CONNECTION_TIMEOUT_MS: 3000,
      MASTER_FIREBIRD_QUERY_TIMEOUT_MS: 5000,
      MASTER_FIREBIRD_MAX_CONNECTIONS: 4,
      MASTER_FIREBIRD_CIRCUIT_FAILURE_THRESHOLD: 3,
      MASTER_FIREBIRD_CIRCUIT_RESET_MS: 30_000,
    });
  });

  it.each([
    ["disabled", { ...validEnvironment, MASTER_FIREBIRD_ENABLED: "false" }],
    ["unexpected user", { ...validEnvironment, MASTER_FIREBIRD_USER: "OTHER_USER" }],
    ["missing host", { ...validEnvironment, MASTER_FIREBIRD_HOST: "" }],
    ["missing database", { ...validEnvironment, MASTER_FIREBIRD_DATABASE: "" }],
    ["missing password", { ...validEnvironment, MASTER_FIREBIRD_PASSWORD: "" }],
    ["unexpected charset", { ...validEnvironment, MASTER_FIREBIRD_CHARSET: "WIN1252" }],
    ["invalid port", { ...validEnvironment, MASTER_FIREBIRD_PORT: "70000" }],
  ])("fails closed for %s", (_case, environment) => {
    expect(() => validateMasterReadOnlyGateEnvironment(environment)).toThrow(
      MasterReadOnlyGateConfigurationError,
    );
  });

  it("does not include rejected configuration or secrets in its error", () => {
    const sensitiveValue = "do-not-disclose-this-secret";
    let caught: unknown;
    try {
      validateMasterReadOnlyGateEnvironment({
        ...validEnvironment,
        MASTER_FIREBIRD_PASSWORD: sensitiveValue,
        MASTER_FIREBIRD_PORT: "invalid-port-containing-sensitive-context",
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(MasterReadOnlyGateConfigurationError);
    expect(String(caught)).not.toContain(sensitiveValue);
    expect(String(caught)).not.toContain("invalid-port-containing-sensitive-context");
  });
});
