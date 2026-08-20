export type OperationalStatus = "AVAILABLE" | "UNAVAILABLE" | "NOT_CONFIGURED" | "UNKNOWN";

export interface AdminSystemStatus {
  generatedAt: string;
  api: {
    status: "AVAILABLE";
    uptimeSeconds: number;
    releaseSha: string | "UNKNOWN";
    version: string | "UNKNOWN";
    migrationVersion: string | "UNKNOWN";
  };
  dependencies: {
    postgres: { status: OperationalStatus; latencyMs: number };
    redis: { status: OperationalStatus; latencyMs: number };
    master: { status: OperationalStatus; latencyMs: number };
  };
  notifications: {
    status: OperationalStatus;
    backlog: number | null;
    failed: number | null;
    deadLetter: number | null;
  };
}
