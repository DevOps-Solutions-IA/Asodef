import type { ConfigService } from "@nestjs/config";
import type { EnvConfig } from "../../../config/env.validation";

export interface MasterFirebirdRuntimeConfig {
  enabled: boolean;
  connectionTimeoutMs: number;
  queryTimeoutMs: number;
  maxConnections: number;
  circuitFailureThreshold: number;
  circuitResetMs: number;
}

export interface MasterFirebirdConnectionConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  charset: "UTF8";
}

export const MASTER_FIREBIRD_EXPECTED_USER = "ASODEF_READONLY" as const;

export function getMasterFirebirdRuntimeConfig(
  config: ConfigService<EnvConfig, true>,
): MasterFirebirdRuntimeConfig {
  return {
    enabled: config.get("MASTER_FIREBIRD_ENABLED", { infer: true }),
    connectionTimeoutMs: config.get("MASTER_FIREBIRD_CONNECTION_TIMEOUT_MS", { infer: true }),
    queryTimeoutMs: config.get("MASTER_FIREBIRD_QUERY_TIMEOUT_MS", { infer: true }),
    maxConnections: config.get("MASTER_FIREBIRD_MAX_CONNECTIONS", { infer: true }),
    circuitFailureThreshold: config.get("MASTER_FIREBIRD_CIRCUIT_FAILURE_THRESHOLD", { infer: true }),
    circuitResetMs: config.get("MASTER_FIREBIRD_CIRCUIT_RESET_MS", { infer: true }),
  };
}

/**
 * This function is intentionally separate from runtime configuration so the
 * disabled path never requests connection fields from ConfigService.
 * Phase 1C calls it only after the enabled flag has passed validation.
 */
export function getMasterFirebirdConnectionConfig(
  config: ConfigService<EnvConfig, true>,
): MasterFirebirdConnectionConfig {
  return {
    host: config.get("MASTER_FIREBIRD_HOST", { infer: true }),
    port: config.get("MASTER_FIREBIRD_PORT", { infer: true }),
    database: config.get("MASTER_FIREBIRD_DATABASE", { infer: true }),
    user: config.get("MASTER_FIREBIRD_USER", { infer: true }),
    password: config.get("MASTER_FIREBIRD_PASSWORD", { infer: true }),
    charset: config.get("MASTER_FIREBIRD_CHARSET", { infer: true }),
  };
}
