export type OperationalStatus = "AVAILABLE" | "UNAVAILABLE" | "NOT_CONFIGURED" | "UNKNOWN";

export interface AdminSystemStatus {
  generatedAt: string;
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
  notifications: {
    status: OperationalStatus;
    backlog: number | null;
    failed: number | null;
    deadLetter: number | null;
  };
}

export interface DependencyStatus {
  status: OperationalStatus;
  latencyMs: number;
}
