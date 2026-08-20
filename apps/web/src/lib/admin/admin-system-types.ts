export type OperationalStatus = "AVAILABLE" | "UNAVAILABLE" | "NOT_CONFIGURED" | "UNKNOWN";
export type CoreSystemStatus = "CORE_HEALTHY" | "DEGRADED_OPTIONAL_DEPENDENCY" | "CORE_UNHEALTHY";

export interface AdminSystemStatus {
  generatedAt: string;
  overallStatus: CoreSystemStatus;
  api: {
    status: "AVAILABLE";
    uptimeSeconds: number;
    releaseSha: string;
    version: string;
    migrationVersion: string;
  };
  dependencies: {
    postgres: DependencyStatus;
    redis: DependencyStatus;
    master: DependencyStatus;
  };
  security: {
    status: "VERIFIED" | "NOT_VERIFIED";
    recoveryChannel: "CONFIGURED" | "NOT_CONFIGURED";
    mfaRequired: boolean;
  };
  notifications: {
    status: OperationalStatus;
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

export interface DependencyStatus {
  status: OperationalStatus;
  latencyMs: number;
}
