export type MasterHealthStatus = "disabled" | "ok" | "degraded" | "unavailable";

export interface MasterHealthResult {
  status: MasterHealthStatus;
}
