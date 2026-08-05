import { apiClient } from "../api-client";
import type { AdminReconciliationDifference, AdminReconciliationRun } from "./admin-reconciliation-types";

export function listReconciliationRuns(signal?: AbortSignal): Promise<AdminReconciliationRun[]> {
  return apiClient.get<AdminReconciliationRun[]>("/admin/reconciliation/runs", { signal });
}

export interface RunReconciliationInput {
  rangeStart: string;
  rangeEnd: string;
  notes?: string;
}

export function runReconciliation(input: RunReconciliationInput): Promise<AdminReconciliationRun> {
  return apiClient.post<AdminReconciliationRun>("/admin/reconciliation/runs", input);
}

export function listReconciliationDifferences(runId: string, signal?: AbortSignal): Promise<AdminReconciliationDifference[]> {
  return apiClient.get<AdminReconciliationDifference[]>(`/admin/reconciliation/runs/${runId}/differences`, { signal });
}

export function resolveReconciliationDifference(differenceId: string, resolutionNotes: string): Promise<AdminReconciliationDifference> {
  return apiClient.post<AdminReconciliationDifference>(`/admin/reconciliation/differences/${differenceId}/resolve`, { resolutionNotes });
}
