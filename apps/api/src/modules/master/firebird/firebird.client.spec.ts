import type { ConfigService } from "@nestjs/config";
import type { EnvConfig } from "../../../config/env.validation";
import {
  MasterIdentityMismatchError,
  MasterTimeoutError,
  MasterUnavailableError,
} from "../domain/master.errors";
import type { FirebirdQueryDefinition } from "./firebird-query.catalog";
import type { FirebirdParameter, FirebirdRow } from "../ports/firebird-read-client";
import { requireReadyQuery } from "./firebird-query.catalog";
import { NodeFirebirdReadClient } from "./firebird.client";
import type {
  NodeFirebirdPoolFactoryPort,
  ReadOnlyFirebirdPool,
  ReadOnlyFirebirdTransaction,
} from "./node-firebird-pool.factory";

describe("NodeFirebirdReadClient", () => {
  function build(options: { enabled?: boolean; currentUser?: string } = {}) {
    const values: Record<string, unknown> = {
      MASTER_FIREBIRD_ENABLED: options.enabled ?? true,
      MASTER_FIREBIRD_HOST: "master.example.invalid",
      MASTER_FIREBIRD_PORT: 3051,
      MASTER_FIREBIRD_DATABASE: "sanitized-database-alias",
      MASTER_FIREBIRD_USER: "ASODEF_READONLY",
      MASTER_FIREBIRD_PASSWORD: "synthetic-test-secret",
      MASTER_FIREBIRD_CHARSET: "UTF8",
      MASTER_FIREBIRD_CONNECTION_TIMEOUT_MS: 3000,
      MASTER_FIREBIRD_QUERY_TIMEOUT_MS: 5000,
      MASTER_FIREBIRD_MAX_CONNECTIONS: 4,
      MASTER_FIREBIRD_CIRCUIT_FAILURE_THRESHOLD: 3,
      MASTER_FIREBIRD_CIRCUIT_RESET_MS: 30000,
    };
    const config = {
      get: jest.fn((key: string) => values[key]),
    } as unknown as ConfigService<EnvConfig, true>;
    const query = jest.fn(async (
      definition: FirebirdQueryDefinition,
      _parameters: readonly FirebirdParameter[],
      _signal: AbortSignal,
    ): Promise<readonly FirebirdRow[]> => {
      if (definition.name === "currentUser") {
        return [{ CURRENT_USER_NAME: options.currentUser ?? "ASODEF_READONLY" }];
      }
      return [{ HEALTH_VALUE: 1 }];
    });
    const rollback = jest.fn(async () => undefined);
    const transaction: ReadOnlyFirebirdTransaction = {
      query: async <T extends FirebirdRow>(
        definition: FirebirdQueryDefinition,
        parameters: readonly FirebirdParameter[],
        signal: AbortSignal,
      ): Promise<readonly T[]> => query(definition, parameters, signal) as unknown as Promise<readonly T[]>,
      rollback,
    };
    const release = jest.fn(async () => undefined);
    const acquire = jest.fn(async () => ({
      beginReadOnly: jest.fn(async () => transaction),
      release,
    }));
    const close = jest.fn(async () => undefined);
    const pool: ReadOnlyFirebirdPool = { acquire, close };
    const create = jest.fn(() => pool);
    const factory: NodeFirebirdPoolFactoryPort = { create };
    const client = new NodeFirebirdReadClient(config, factory);
    return { client, create, query, rollback, release, acquire, close, values };
  }

  it("does not create a pool or connect while the feature is disabled", async () => {
    const { client, create } = build({ enabled: false });
    await expect(client.query(requireReadyQuery("health"), [], {
      signal: new AbortController().signal,
    })).rejects.toMatchObject({ code: "MASTER_DISABLED" });
    expect(create).not.toHaveBeenCalled();
  });

  it("uses only static definitions and separate parameters inside a read-only transaction", async () => {
    const { client, query, rollback, release } = build();
    const definition = requireReadyQuery("getContract");
    await client.query(definition, ["10"], { signal: new AbortController().signal });

    expect(query).toHaveBeenNthCalledWith(1, requireReadyQuery("currentUser"), [], expect.any(AbortSignal));
    expect(query).toHaveBeenNthCalledWith(2, definition, ["10"], expect.any(AbortSignal));
    expect(rollback).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("aborts and closes the pool when CURRENT_USER is not ASODEF_READONLY", async () => {
    const { client, close, rollback, release } = build({ currentUser: "UNEXPECTED_USER" });
    await expect(client.query(requireReadyQuery("currentUser"), [], {
      signal: new AbortController().signal,
    })).rejects.toBeInstanceOf(MasterIdentityMismatchError);
    expect(rollback).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("sanitizes native connection errors so configuration and password never escape", async () => {
    const { client, acquire, values } = build();
    const nativeDetail = `${String(values.MASTER_FIREBIRD_HOST)}:${String(values.MASTER_FIREBIRD_PORT)}/${String(values.MASTER_FIREBIRD_DATABASE)}?password=${String(values.MASTER_FIREBIRD_PASSWORD)}`;
    acquire.mockRejectedValueOnce(new Error(nativeDetail));

    const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const consoleWarn = jest.spyOn(console, "warn").mockImplementation(() => undefined);

    try {
      const operation = client.query(requireReadyQuery("health"), [], {
        signal: new AbortController().signal,
      });
      await expect(operation).rejects.toBeInstanceOf(MasterUnavailableError);
      await expect(operation).rejects.not.toThrow(nativeDetail);
      expect(consoleError).not.toHaveBeenCalled();
      expect(consoleWarn).not.toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
      consoleWarn.mockRestore();
    }
  });

  it("maps an aborted driver operation to the controlled timeout error and still cleans up", async () => {
    const { client, query, rollback, release } = build();
    const controller = new AbortController();
    query.mockImplementationOnce(async () => [{ CURRENT_USER_NAME: "ASODEF_READONLY" }]);
    query.mockImplementationOnce(async () => {
      controller.abort();
      throw new Error("native timeout detail");
    });

    await expect(client.query(requireReadyQuery("health"), [], {
      signal: controller.signal,
    })).rejects.toBeInstanceOf(MasterTimeoutError);
    expect(rollback).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("destroys the pool during module shutdown", async () => {
    const { client, close } = build();
    await client.query(requireReadyQuery("currentUser"), [], {
      signal: new AbortController().signal,
    });
    await client.onModuleDestroy();
    expect(close).toHaveBeenCalledTimes(1);
  });
});
