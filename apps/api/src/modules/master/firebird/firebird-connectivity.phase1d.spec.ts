import type { ConfigService } from "@nestjs/config";
import type { EnvConfig } from "../../../config/env.validation";
import {
  MasterIdentityMismatchError,
  MasterUnavailableError,
} from "../domain/master.errors";
import type { FirebirdParameter, FirebirdRow } from "../ports/firebird-read-client";
import { NodeFirebirdReadClient } from "./firebird.client";
import type { FirebirdQueryDefinition } from "./firebird-query.catalog";
import { requireReadyQuery } from "./firebird-query.catalog";
import type {
  NodeFirebirdPoolFactoryPort,
  ReadOnlyFirebirdConnection,
  ReadOnlyFirebirdPool,
  ReadOnlyFirebirdTransaction,
} from "./node-firebird-pool.factory";

const SAFE_RUNTIME_VALUES: Record<string, unknown> = {
  MASTER_FIREBIRD_ENABLED: true,
  MASTER_FIREBIRD_HOST: "private-master.invalid",
  MASTER_FIREBIRD_PORT: 3051,
  MASTER_FIREBIRD_DATABASE: "MASTER_ALIAS",
  MASTER_FIREBIRD_USER: "ASODEF_READONLY",
  MASTER_FIREBIRD_PASSWORD: "phase1d-synthetic-secret",
  MASTER_FIREBIRD_CHARSET: "UTF8",
  MASTER_FIREBIRD_CONNECTION_TIMEOUT_MS: 3000,
  MASTER_FIREBIRD_QUERY_TIMEOUT_MS: 5000,
  MASTER_FIREBIRD_MAX_CONNECTIONS: 4,
  MASTER_FIREBIRD_CIRCUIT_FAILURE_THRESHOLD: 3,
  MASTER_FIREBIRD_CIRCUIT_RESET_MS: 30_000,
};

function config(overrides: Record<string, unknown> = {}): ConfigService<EnvConfig, true> {
  const values = { ...SAFE_RUNTIME_VALUES, ...overrides };
  return {
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService<EnvConfig, true>;
}

function connectionHarness() {
  const query = jest.fn(
    async (
      definition: FirebirdQueryDefinition,
      _parameters: readonly FirebirdParameter[],
      _signal: AbortSignal,
    ): Promise<readonly FirebirdRow[]> => definition.name === "currentUser"
      ? [{ CURRENT_USER_NAME: "ASODEF_READONLY" }]
      : [{ HEALTH_VALUE: 1 }],
  );
  const rollback = jest.fn(async () => undefined);
  const release = jest.fn(async () => undefined);
  const transaction: ReadOnlyFirebirdTransaction = {
    query: <T extends FirebirdRow>(
      definition: FirebirdQueryDefinition,
      parameters: readonly FirebirdParameter[],
      signal: AbortSignal,
    ) => query(definition, parameters, signal) as Promise<readonly T[]>,
    rollback,
  };
  const connection: ReadOnlyFirebirdConnection = {
    beginReadOnly: jest.fn(async () => transaction),
    release,
  };
  const acquire = jest.fn(async () => connection);
  const close = jest.fn(async () => undefined);
  const pool: ReadOnlyFirebirdPool = { acquire, close };
  const create = jest.fn(() => pool);
  const factory: NodeFirebirdPoolFactoryPort = { create };

  return { factory, create, acquire, query, rollback, release, close };
}

describe("Phase 1D Firebird transport failure isolation", () => {
  it("never creates a pool, DNS lookup, or socket when the adapter is disabled", async () => {
    const harness = connectionHarness();
    const client = new NodeFirebirdReadClient(
      config({ MASTER_FIREBIRD_ENABLED: false }),
      harness.factory,
    );

    await expect(client.query(requireReadyQuery("health"), [], {
      signal: new AbortController().signal,
    })).rejects.toMatchObject({ code: "MASTER_DISABLED" });

    expect(harness.create).not.toHaveBeenCalled();
    expect(harness.acquire).not.toHaveBeenCalled();
  });

  it("rejects an unexpected configured identity before creating a pool and remains fail-closed", async () => {
    const harness = connectionHarness();
    const client = new NodeFirebirdReadClient(
      config({ MASTER_FIREBIRD_USER: "UNEXPECTED_USER" }),
      harness.factory,
    );
    const operation = () => client.query(requireReadyQuery("health"), [], {
      signal: new AbortController().signal,
    });

    await expect(operation()).rejects.toBeInstanceOf(MasterIdentityMismatchError);
    await expect(operation()).rejects.toBeInstanceOf(MasterIdentityMismatchError);
    expect(harness.create).not.toHaveBeenCalled();
    expect(harness.acquire).not.toHaveBeenCalled();
  });

  it.each([
    ["wrong host or absent tunnel", "connect ECONNREFUSED private-master.invalid:3051"],
    ["wrong database alias", "database MASTER_ALIAS was not found"],
  ])("maps %s to a sanitized unavailable error without logging transport details", async (_case, nativeMessage) => {
    const harness = connectionHarness();
    harness.acquire.mockRejectedValueOnce(new Error(`${nativeMessage} phase1d-synthetic-secret`));
    const client = new NodeFirebirdReadClient(config(), harness.factory);
    const consoleLog = jest.spyOn(console, "log").mockImplementation(() => undefined);
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const consoleWarn = jest.spyOn(console, "warn").mockImplementation(() => undefined);

    try {
      let caught: unknown;
      try {
        await client.query(requireReadyQuery("health"), [], {
          signal: new AbortController().signal,
        });
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(MasterUnavailableError);
      expect(String(caught)).not.toContain(nativeMessage);
      expect(String(caught)).not.toContain("phase1d-synthetic-secret");
      expect(consoleLog).not.toHaveBeenCalled();
      expect(consoleError).not.toHaveBeenCalled();
      expect(consoleWarn).not.toHaveBeenCalled();
    } finally {
      consoleLog.mockRestore();
      consoleError.mockRestore();
      consoleWarn.mockRestore();
    }
  });

  it("recovers on the next query after the mocked tunnel transport returns", async () => {
    const harness = connectionHarness();
    harness.acquire.mockRejectedValueOnce(new Error("tunnel unavailable"));
    const client = new NodeFirebirdReadClient(config(), harness.factory);

    await expect(client.query(requireReadyQuery("health"), [], {
      signal: new AbortController().signal,
    })).rejects.toBeInstanceOf(MasterUnavailableError);

    await expect(client.query(requireReadyQuery("health"), [], {
      signal: new AbortController().signal,
    })).resolves.toEqual([{ HEALTH_VALUE: 1 }]);
    expect(harness.create).toHaveBeenCalledTimes(1);
    expect(harness.acquire).toHaveBeenCalledTimes(2);
    expect(harness.query).toHaveBeenNthCalledWith(
      1,
      requireReadyQuery("currentUser"),
      [],
      expect.any(AbortSignal),
    );
    expect(harness.query).toHaveBeenNthCalledWith(
      2,
      requireReadyQuery("health"),
      [],
      expect.any(AbortSignal),
    );
  });

  it("makes a server identity mismatch sticky and performs no further acquisition", async () => {
    const harness = connectionHarness();
    harness.query.mockResolvedValueOnce([{ CURRENT_USER_NAME: "OTHER_READ_USER" }]);
    const client = new NodeFirebirdReadClient(config(), harness.factory);
    const operation = () => client.query(requireReadyQuery("currentUser"), [], {
      signal: new AbortController().signal,
    });

    await expect(operation()).rejects.toBeInstanceOf(MasterIdentityMismatchError);
    await expect(operation()).rejects.toBeInstanceOf(MasterIdentityMismatchError);
    expect(harness.acquire).toHaveBeenCalledTimes(1);
    expect(harness.rollback).toHaveBeenCalledTimes(1);
    expect(harness.release).toHaveBeenCalledTimes(1);
    expect(harness.close).toHaveBeenCalledTimes(1);
  });

  it("rolls back and detaches after a non-timeout query failure", async () => {
    const harness = connectionHarness();
    harness.query
      .mockResolvedValueOnce([{ CURRENT_USER_NAME: "ASODEF_READONLY" }])
      .mockRejectedValueOnce(new Error("native row decoding detail"));
    const client = new NodeFirebirdReadClient(config(), harness.factory);

    await expect(client.query(requireReadyQuery("health"), [], {
      signal: new AbortController().signal,
    })).rejects.toBeInstanceOf(MasterUnavailableError);
    expect(harness.rollback).toHaveBeenCalledTimes(1);
    expect(harness.release).toHaveBeenCalledTimes(1);
  });
});
