import type { ConfigService } from "@nestjs/config";
import { MODULE_METADATA } from "@nestjs/common/constants";
import type { EnvConfig } from "../../config/env.validation";
import type { MasterHealthService } from "../master/health/master-health.service";
import { HybridExternalCoreProvider } from "./hybrid-external-core.provider";
import type { NotConfiguredExternalCoreProvider } from "./not-configured.provider";
import { SelfServiceModule } from "./self-service.module";
import {
  selectExternalCoreProvider,
  SelfServiceProviderRegistry,
} from "./self-service-provider.registry";

describe("self-service provider registry", () => {
  function config(
    provider: "not_configured" | "hybrid" | "http",
  ): ConfigService<EnvConfig, true> {
    return { get: jest.fn(() => provider) } as unknown as ConfigService<
      EnvConfig,
      true
    >;
  }

  it("installs the hybrid adapter explicitly while preserving fail-closed mode", () => {
    const notConfigured = {} as NotConfiguredExternalCoreProvider;
    const hybrid = {} as HybridExternalCoreProvider;
    expect(
      selectExternalCoreProvider(
        config("not_configured"),
        notConfigured,
        hybrid,
      ),
    ).toBe(notConfigured);
    expect(
      selectExternalCoreProvider(config("hybrid"), notConfigured, hybrid),
    ).toBe(hybrid);
  });

  it("registers the real hybrid provider in SelfServiceModule", () => {
    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      SelfServiceModule,
    ) as readonly unknown[];
    expect(providers).toContain(HybridExternalCoreProvider);
  });

  it("keeps the future HTTP mode fail-fast until a real adapter exists", () => {
    expect(() =>
      selectExternalCoreProvider(
        config("http"),
        {} as NotConfiguredExternalCoreProvider,
        {} as HybridExternalCoreProvider,
      ),
    ).toThrow(/adapter is not installed/);
  });

  it("reports hybrid availability from the real Master health boundary", async () => {
    const masterHealth = {
      check: jest.fn(async () => ({ status: "ok" })),
    } as unknown as MasterHealthService;
    const registry = new SelfServiceProviderRegistry(
      config("hybrid"),
      masterHealth,
    );
    await expect(registry.health()).resolves.toEqual({
      status: "AVAILABLE",
      provider: "hybrid",
    });
    expect(masterHealth.check).toHaveBeenCalledTimes(1);
  });

  it("does not claim hybrid availability when Master is disabled", async () => {
    const masterHealth = {
      check: jest.fn(async () => ({ status: "disabled" })),
    } as unknown as MasterHealthService;
    const registry = new SelfServiceProviderRegistry(
      config("hybrid"),
      masterHealth,
    );
    await expect(registry.health()).resolves.toEqual({
      status: "UNAVAILABLE",
      provider: "hybrid",
    });
  });
});
