import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { EnvConfig } from "../../config/env.validation";
import type { ExternalCoreProvider } from "./external-core.provider";
import { NotConfiguredExternalCoreProvider } from "./not-configured.provider";

export type SelfServiceProviderHealth = "NOT_CONFIGURED" | "AVAILABLE" | "DEGRADED" | "UNAVAILABLE";

export function selectExternalCoreProvider(
  config: ConfigService<EnvConfig, true>,
  notConfigured: NotConfiguredExternalCoreProvider,
): ExternalCoreProvider {
  const provider = config.get("EXTERNAL_CORE_PROVIDER", { infer: true });
  if (provider === "not_configured") return notConfigured;
  throw new Error(`External core provider adapter is not installed for configured provider: ${provider}`);
}

@Injectable()
export class SelfServiceProviderRegistry {
  constructor(private readonly config: ConfigService<EnvConfig, true>) {}

  health(): { status: SelfServiceProviderHealth; provider: "not_configured" | "http" } {
    const provider = this.config.get("EXTERNAL_CORE_PROVIDER", { infer: true });
    // A real adapter may later expose AVAILABLE/DEGRADED/UNAVAILABLE through
    // this stable shape. The repository currently ships only fail-closed mode.
    return { status: provider === "not_configured" ? "NOT_CONFIGURED" : "UNAVAILABLE", provider };
  }
}
