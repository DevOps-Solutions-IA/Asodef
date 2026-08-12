import type { ConfigService } from "@nestjs/config";
import type { EnvConfig } from "../../../config/env.validation";
import type { FirebirdReadExecutor } from "../firebird/firebird-read.executor";
import { MasterHealthService } from "./master-health.service";

function config(enabled: boolean): ConfigService<EnvConfig, true> {
  const values: Partial<EnvConfig> = {
    MASTER_FIREBIRD_ENABLED: enabled,
    MASTER_FIREBIRD_CONNECTION_TIMEOUT_MS: 3000,
    MASTER_FIREBIRD_QUERY_TIMEOUT_MS: 5000,
    MASTER_FIREBIRD_MAX_CONNECTIONS: 4,
    MASTER_FIREBIRD_CIRCUIT_FAILURE_THRESHOLD: 3,
    MASTER_FIREBIRD_CIRCUIT_RESET_MS: 30000,
  };
  return { get: jest.fn((key: keyof EnvConfig) => values[key]) } as unknown as ConfigService<EnvConfig, true>;
}

describe("MasterHealthService", () => {
  it("returns disabled without invoking the Firebird executor", async () => {
    const executor = { run: jest.fn() } as unknown as FirebirdReadExecutor;
    const service = new MasterHealthService(config(false), executor);

    await expect(service.check()).resolves.toEqual({ status: "disabled" });
    expect(executor.run).not.toHaveBeenCalled();
  });

  it("reports ok only when the technical SELECT succeeds", async () => {
    const executor = { run: jest.fn().mockResolvedValue([{ 1: 1 }]) } as unknown as FirebirdReadExecutor;
    const service = new MasterHealthService(config(true), executor);
    await expect(service.check()).resolves.toEqual({ status: "ok" });
  });

  it("contains enabled driver failures as unavailable", async () => {
    const executor = { run: jest.fn().mockRejectedValue(new Error("connection failed")) } as unknown as FirebirdReadExecutor;
    const service = new MasterHealthService(config(true), executor);
    await expect(service.check()).resolves.toEqual({ status: "unavailable" });
  });
});
