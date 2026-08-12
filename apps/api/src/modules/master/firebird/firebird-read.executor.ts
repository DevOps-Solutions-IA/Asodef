import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { EnvConfig } from "../../../config/env.validation";
import {
  MasterDomainError,
  MasterTimeoutError,
  MasterUnavailableError,
} from "../domain/master.errors";
import {
  FIREBIRD_READ_CLIENT,
  type FirebirdParameter,
  type FirebirdReadClient,
  type FirebirdRow,
} from "../ports/firebird-read-client";
import { getMasterFirebirdRuntimeConfig } from "./firebird.config";
import type { FirebirdQueryDefinition } from "./firebird-query.catalog";
import { MasterCircuitBreaker } from "./master-circuit-breaker";

@Injectable()
export class FirebirdReadExecutor {
  private readonly queryTimeoutMs: number;
  private readonly maxConnections: number;
  private readonly circuit: MasterCircuitBreaker;
  private activeQueries = 0;

  constructor(
    @Inject(FIREBIRD_READ_CLIENT) private readonly client: FirebirdReadClient,
    config: ConfigService<EnvConfig, true>,
  ) {
    const runtime = getMasterFirebirdRuntimeConfig(config);
    this.queryTimeoutMs = runtime.queryTimeoutMs;
    this.maxConnections = runtime.maxConnections;
    this.circuit = new MasterCircuitBreaker(runtime.circuitFailureThreshold, runtime.circuitResetMs);
  }

  async run<T extends FirebirdRow>(
    definition: FirebirdQueryDefinition,
    parameters: readonly FirebirdParameter[],
  ): Promise<readonly T[]> {
    if (parameters.length !== definition.parameterCount) {
      throw new Error(`Invalid parameter count for master operation ${definition.name}`);
    }
    if (this.activeQueries >= this.maxConnections) throw new MasterUnavailableError();
    this.circuit.beforeRequest();
    this.activeQueries += 1;
    const controller = new AbortController();
    let timer: NodeJS.Timeout | undefined;

    try {
      const timeout = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new MasterTimeoutError());
        }, this.queryTimeoutMs);
      });
      const rows = await Promise.race([
        this.client.query<T>(definition, parameters, { signal: controller.signal }),
        timeout,
      ]);
      this.circuit.recordSuccess();
      return rows;
    } catch (error) {
      if (error instanceof MasterDomainError) {
        if (error.retryable) this.circuit.recordFailure();
        else this.circuit.recordIgnored();
        throw error;
      }
      this.circuit.recordFailure();
      throw new MasterUnavailableError();
    } finally {
      if (timer) clearTimeout(timer);
      this.activeQueries -= 1;
    }
  }
}
