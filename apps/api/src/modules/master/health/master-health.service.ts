import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { EnvConfig } from "../../../config/env.validation";
import type { MasterHealthResult } from "../domain/master-status";
import { FirebirdReadExecutor } from "../firebird/firebird-read.executor";
import { getMasterFirebirdRuntimeConfig } from "../firebird/firebird.config";
import { requireReadyQuery } from "../firebird/firebird-query.catalog";

@Injectable()
export class MasterHealthService {
  private readonly enabled: boolean;

  constructor(
    config: ConfigService<EnvConfig, true>,
    private readonly executor: FirebirdReadExecutor,
  ) {
    this.enabled = getMasterFirebirdRuntimeConfig(config).enabled;
  }

  async check(): Promise<MasterHealthResult> {
    if (!this.enabled) return { status: "disabled" };
    try {
      await this.executor.run(requireReadyQuery("health"), []);
      return { status: "ok" };
    } catch {
      return { status: "unavailable" };
    }
  }
}
