import type { ConfigService } from "@nestjs/config";
import type { EnvConfig } from "../../../config/env.validation";
import {
  MasterCircuitOpenError,
  MasterIdentityMismatchError,
  MasterUnavailableError,
} from "../domain/master.errors";
import type { FirebirdReadClient, FirebirdRow } from "../ports/firebird-read-client";
import { FirebirdReadExecutor as Executor } from "./firebird-read.executor";
import {
  assertReadOnlyQuery,
  requireReadyQuery,
  type FirebirdQueryDefinition,
} from "./firebird-query.catalog";
import { MasterCircuitBreaker } from "./master-circuit-breaker";

const RUNTIME_CONFIG: Partial<EnvConfig> = {
  MASTER_FIREBIRD_ENABLED: true,
  MASTER_FIREBIRD_CONNECTION_TIMEOUT_MS: 3000,
  MASTER_FIREBIRD_QUERY_TIMEOUT_MS: 5000,
  MASTER_FIREBIRD_MAX_CONNECTIONS: 1,
  MASTER_FIREBIRD_CIRCUIT_FAILURE_THRESHOLD: 2,
  MASTER_FIREBIRD_CIRCUIT_RESET_MS: 1000,
};

function config(overrides: Partial<EnvConfig> = {}): ConfigService<EnvConfig, true> {
  const values = { ...RUNTIME_CONFIG, ...overrides } as Record<string, unknown>;
  return {
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService<EnvConfig, true>;
}

function unsafeQuery(sql: string): FirebirdQueryDefinition {
  return {
    name: "health",
    sql,
    tables: ["TBLCONTRATO"],
    parameterCount: 0,
    purpose: "SECURITY_GATE",
  };
}

describe("Phase 1D Firebird executor resilience", () => {
  it("enforces the configured concurrency bound without invoking an extra driver query", async () => {
    let resolveFirst: ((rows: readonly FirebirdRow[]) => void) | undefined;
    const first = new Promise<readonly FirebirdRow[]>((resolve) => {
      resolveFirst = resolve;
    });
    const client = { query: jest.fn().mockReturnValue(first) } as unknown as FirebirdReadClient;
    const executor = new Executor(client, config());
    const definition = requireReadyQuery("health");

    const active = executor.run(definition, []);
    await expect(executor.run(definition, [])).rejects.toBeInstanceOf(MasterUnavailableError);
    expect(client.query).toHaveBeenCalledTimes(1);

    resolveFirst?.([{ HEALTH_VALUE: 1 }]);
    await expect(active).resolves.toEqual([{ HEALTH_VALUE: 1 }]);
  });

  it("opens, probes, and closes the circuit deterministically after transport recovery", () => {
    let now = 1000;
    const circuit = new MasterCircuitBreaker(2, 5000, () => now);

    circuit.beforeRequest();
    circuit.recordFailure();
    circuit.beforeRequest();
    circuit.recordFailure();
    expect(circuit.snapshot()).toEqual({ state: "OPEN", consecutiveFailures: 2 });
    expect(() => circuit.beforeRequest()).toThrow(MasterCircuitOpenError);

    now += 5000;
    expect(() => circuit.beforeRequest()).not.toThrow();
    expect(() => circuit.beforeRequest()).toThrow(MasterCircuitOpenError);
    circuit.recordSuccess();
    expect(circuit.snapshot()).toEqual({ state: "CLOSED", consecutiveFailures: 0 });
    expect(() => circuit.beforeRequest()).not.toThrow();
  });

  it("does not count a non-retryable domain rejection as a transport failure", async () => {
    const client = {
      query: jest.fn().mockRejectedValue(new MasterIdentityMismatchError()),
    } as unknown as FirebirdReadClient;
    const executor = new Executor(
      client,
      config({ MASTER_FIREBIRD_CIRCUIT_FAILURE_THRESHOLD: 1 }),
    );

    await expect(executor.run(requireReadyQuery("health"), [])).rejects.toBeInstanceOf(MasterIdentityMismatchError);
    await expect(executor.run(requireReadyQuery("health"), [])).rejects.toBeInstanceOf(MasterIdentityMismatchError);
    expect(client.query).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["INSERT", "INSERT INTO TBLCONTRATO (IDCONTRATO) VALUES (1)"],
    ["UPDATE", "UPDATE TBLCONTRATO SET ESTADO = 1"],
    ["DELETE", "DELETE FROM TBLCONTRATO"],
    ["MERGE", "MERGE INTO TBLCONTRATO USING TBLCONTRATO ON 1 = 1 WHEN MATCHED THEN UPDATE SET ESTADO = 1"],
    ["CREATE", "CREATE TABLE TBLCONTRATO (ID INTEGER)"],
    ["ALTER", "ALTER TABLE TBLCONTRATO ADD X INTEGER"],
    ["DROP", "DROP TABLE TBLCONTRATO"],
    ["TRUNCATE", "TRUNCATE TABLE TBLCONTRATO"],
    ["EXECUTE PROCEDURE", "EXECUTE PROCEDURE P_PAGOSPISCOPAY"],
    ["GRANT", "GRANT SELECT ON TBLCONTRATO TO PUBLIC"],
    ["REVOKE", "REVOKE SELECT ON TBLCONTRATO FROM PUBLIC"],
    ["semicolon batching", "SELECT * FROM TBLCONTRATO; DELETE FROM TBLCONTRATO"],
    ["blocked procedure token", "SELECT P_PAGOSPISCOPAY FROM TBLCONTRATO"],
    ["blocked configuration table", "SELECT * FROM TBLPAYCONFIGURACION"],
  ])("rejects %s in a static catalog definition", (_case, sql) => {
    expect(() => assertReadOnlyQuery(unsafeQuery(sql))).toThrow(/Unsafe master query|Undeclared table/);
  });

  it("keeps approved query inputs separate from their static SQL text", async () => {
    const hostileParameter = "1' OR '1'='1; EXECUTE PROCEDURE P_PAGOSPISCOPAY";
    const query = jest.fn(async (): Promise<readonly FirebirdRow[]> => []);
    const executor = new Executor({ query } as FirebirdReadClient, config());
    const definition = requireReadyQuery("getContract");

    await executor.run(definition, [hostileParameter]);

    expect(definition.sql).not.toContain(hostileParameter);
    expect(query).toHaveBeenCalledWith(
      definition,
      [hostileParameter],
      { signal: expect.any(AbortSignal) },
    );
  });
});
