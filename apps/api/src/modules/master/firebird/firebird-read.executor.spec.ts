import type { ConfigService } from "@nestjs/config";
import type { EnvConfig } from "../../../config/env.validation";
import {
  MasterCircuitOpenError,
  MasterTimeoutError,
  MasterUnavailableError,
} from "../domain/master.errors";
import type { FirebirdReadClient } from "../ports/firebird-read-client";
import { FirebirdReadExecutor } from "./firebird-read.executor";
import { requireReadyQuery } from "./firebird-query.catalog";

const RUNTIME_CONFIG: Partial<EnvConfig> = {
  MASTER_FIREBIRD_ENABLED: true,
  MASTER_FIREBIRD_CONNECTION_TIMEOUT_MS: 3000,
  MASTER_FIREBIRD_QUERY_TIMEOUT_MS: 5000,
  MASTER_FIREBIRD_MAX_CONNECTIONS: 4,
  MASTER_FIREBIRD_CIRCUIT_FAILURE_THRESHOLD: 3,
  MASTER_FIREBIRD_CIRCUIT_RESET_MS: 30000,
};

function configService(overrides: Partial<EnvConfig> = {}): ConfigService<EnvConfig, true> {
  const values = { ...RUNTIME_CONFIG, ...overrides } as Record<string, unknown>;
  return { get: jest.fn((key: string) => values[key]) } as unknown as ConfigService<EnvConfig, true>;
}

describe("FirebirdReadExecutor", () => {
  it("maps driver failures to a controlled unavailable error", async () => {
    const client = { query: jest.fn().mockRejectedValue(new Error("native connection detail")) };
    const executor = new FirebirdReadExecutor(client as FirebirdReadClient, configService());

    await expect(executor.run(requireReadyQuery("health"), [])).rejects.toBeInstanceOf(MasterUnavailableError);
  });

  it("aborts and returns a controlled timeout", async () => {
    jest.useFakeTimers();
    try {
      let capturedSignal: AbortSignal | undefined;
      const client = {
        query: jest.fn((_definition, _parameters, options: { signal: AbortSignal }) => {
          capturedSignal = options.signal;
          return new Promise(() => undefined);
        }),
      };
      const executor = new FirebirdReadExecutor(
        client as FirebirdReadClient,
        configService({ MASTER_FIREBIRD_QUERY_TIMEOUT_MS: 500 }),
      );

      const result = expect(executor.run(requireReadyQuery("health"), [])).rejects.toBeInstanceOf(MasterTimeoutError);
      await jest.advanceTimersByTimeAsync(500);
      await result;
      expect(capturedSignal?.aborted).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });

  it("opens the circuit after the configured number of retryable failures", async () => {
    const client = { query: jest.fn().mockRejectedValue(new MasterUnavailableError()) };
    const executor = new FirebirdReadExecutor(
      client as FirebirdReadClient,
      configService({ MASTER_FIREBIRD_CIRCUIT_FAILURE_THRESHOLD: 2 }),
    );
    const query = requireReadyQuery("health");

    await expect(executor.run(query, [])).rejects.toBeInstanceOf(MasterUnavailableError);
    await expect(executor.run(query, [])).rejects.toBeInstanceOf(MasterUnavailableError);
    await expect(executor.run(query, [])).rejects.toBeInstanceOf(MasterCircuitOpenError);
    expect(client.query).toHaveBeenCalledTimes(2);
  });

  it("rejects a mismatched parameter count before calling the driver", async () => {
    const client = { query: jest.fn() };
    const executor = new FirebirdReadExecutor(client as FirebirdReadClient, configService());

    await expect(executor.run(requireReadyQuery("getContract"), [])).rejects.toThrow(/parameter count/);
    expect(client.query).not.toHaveBeenCalled();
  });
});
