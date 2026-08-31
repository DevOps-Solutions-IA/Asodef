import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { EnvConfig } from "../../config/env.validation";
import { MasterHealthService } from "../master/health/master-health.service";
import type { ExternalCoreProvider } from "./external-core.provider";
import { HybridExternalCoreProvider } from "./hybrid-external-core.provider";
import { NotConfiguredExternalCoreProvider } from "./not-configured.provider";

export type SelfServiceProviderHealth =
  "NOT_CONFIGURED" | "AVAILABLE" | "DEGRADED" | "UNAVAILABLE";

export function selectExternalCoreProvider(
  config: ConfigService<EnvConfig, true>,
  notConfigured: NotConfiguredExternalCoreProvider,
  hybrid: HybridExternalCoreProvider,
): ExternalCoreProvider {
  const provider = config.get("EXTERNAL_CORE_PROVIDER", { infer: true });
  if (provider === "not_configured") return notConfigured;
  if (provider === "hybrid") return hybrid;
  throw new Error(
    `External core provider adapter is not installed for configured provider: ${provider}`,
  );
}

@Injectable()
export class SelfServiceProviderRegistry {
  constructor(
    private readonly config: ConfigService<EnvConfig, true>,
    private readonly masterHealth: MasterHealthService,
  ) {}

  async health(): Promise<{
    status: SelfServiceProviderHealth;
    provider: "not_configured" | "hybrid" | "http";
  }> {
    const provider = this.config.get("EXTERNAL_CORE_PROVIDER", { infer: true });
    if (provider === "not_configured")
      return { status: "NOT_CONFIGURED", provider };
    if (provider === "http") return { status: "UNAVAILABLE", provider };
    const master = await this.masterHealth.check();
    return {
      status: master.status === "ok" ? "AVAILABLE" : "UNAVAILABLE",
      provider,
    };
  }
}
