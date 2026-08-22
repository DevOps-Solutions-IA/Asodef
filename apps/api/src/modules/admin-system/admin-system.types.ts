export type HealthState =
  | "HEALTHY"
  | "DEGRADED"
  | "UNAVAILABLE"
  | "UNKNOWN"
  | "NOT_CONFIGURED"
  | "DISABLED";
export type Criticality = "CORE" | "IMPORTANT" | "OPTIONAL";

export interface TechnicalComponentStatus {
  state: HealthState;
  criticality: Criticality;
  operationalImpact: string;
  latencyMs: number | null;
  lastCheckedAt: string;
}

export interface AdminSystemStatus {
  generatedAt: string;
  core: {
    state: HealthState;
    operationalImpact: string;
  };
  api: TechnicalComponentStatus & {
    uptimeSeconds: number;
    releaseSha: string | "UNKNOWN";
    version: string | "UNKNOWN";
    migrationVersion: string | "UNKNOWN";
  };
  services: {
    postgres: TechnicalComponentStatus;
    redis: TechnicalComponentStatus;
  };
  integrations: {
    master: TechnicalComponentStatus;
    bold: TechnicalComponentStatus & {
      mode: "mock" | "sandbox" | "production";
    };
    smtp: TechnicalComponentStatus & { configured: boolean };
  };
  security: {
    state: HealthState;
    recoveryChannel: "CONFIGURED" | "NOT_CONFIGURED";
    mfaRequired: boolean;
  };
  notifications: {
    queueState: HealthState;
    transportState: HealthState;
    transport: "SMTP" | "NOOP";
    transportConfigured: boolean;
    backlog: number | null;
    queued: number | null;
    processing: number | null;
    retryPending: number | null;
    failed: number | null;
    unknownResult: number | null;
    deadLetter: number | null;
  };
}
