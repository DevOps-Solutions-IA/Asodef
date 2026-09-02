import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { EnvConfig } from "../../config/env.validation";
import type { ExternalCoreProvider } from "./external-core.provider";
import { MasterExternalCoreProvider } from "./master-external-core.provider";
import { NotConfiguredExternalCoreProvider } from "./not-configured.provider";

export type SelfServiceProviderHealth = "NOT_CONFIGURED" | "AVAILABLE" | "DEGRADED" | "UNAVAILABLE";

export function selectExternalCoreProvider(
  config: ConfigService<EnvConfig, true>,
  notConfigured: NotConfiguredExternalCoreProvider,
  master: MasterExternalCoreProvider,
): ExternalCoreProvider {
  const provider = config.get("EXTERNAL_CORE_PROVIDER", { infer: true });
  if (provider === "not_configured") return notConfigured;
  if (provider === "master") return master;
  throw new Error(`External core provider adapter is not installed for configured provider: ${provider}`);
}

@Injectable()
export class SelfServiceProviderRegistry {
  constructor(private readonly config: ConfigService<EnvConfig, true>) {}

  health(): { status: SelfServiceProviderHealth; provider: "not_configured" | "http" | "master" } {
    const provider = this.config.get("EXTERNAL_CORE_PROVIDER", { infer: true });
    if (provider === "not_configured") return { status: "NOT_CONFIGURED", provider };
    if (provider === "master") {
      return {
        status: this.config.get("MASTER_FIREBIRD_ENABLED", { infer: true }) ? "AVAILABLE" : "UNAVAILABLE",
        provider,
      };
    }
    return { status: "UNAVAILABLE", provider };
  }
}
