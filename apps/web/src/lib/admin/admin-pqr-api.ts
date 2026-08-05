import { apiClient } from "../api-client";
import type { AdminPqrCase, AdminPqrCaseListResponse, ListPqrCasesFilters } from "./admin-pqr-types";

function toQueryString(filters: object): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters as Record<string, unknown>)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

export function listPqrCases(filters: ListPqrCasesFilters, signal?: AbortSignal): Promise<AdminPqrCaseListResponse> {
  return apiClient.get<AdminPqrCaseListResponse>(`/admin/pqr-cases${toQueryString(filters)}`, { signal });
}

export function getPqrCase(id: string, signal?: AbortSignal): Promise<AdminPqrCase> {
  return apiClient.get<AdminPqrCase>(`/admin/pqr-cases/${id}`, { signal });
}

export function assignPqrCase(id: string, assignedTeam: string): Promise<AdminPqrCase> {
  return apiClient.patch<AdminPqrCase>(`/admin/pqr-cases/${id}/assign`, { assignedTeam });
}

export interface TransitionPqrCaseInput {
  status: string;
  notes: string;
  resolution?: string;
}

export function transitionPqrCase(id: string, input: TransitionPqrCaseInput): Promise<AdminPqrCase> {
  return apiClient.post<AdminPqrCase>(`/admin/pqr-cases/${id}/transition`, input);
}
