import { apiClient } from "../api-client";
import type { AdminDataSubjectRequest, AdminDataSubjectRequestListResponse, ListDataSubjectRequestsFilters } from "./admin-dsr-types";

function toQueryString(filters: object): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters as Record<string, unknown>)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

export function listDataSubjectRequests(filters: ListDataSubjectRequestsFilters, signal?: AbortSignal): Promise<AdminDataSubjectRequestListResponse> {
  return apiClient.get<AdminDataSubjectRequestListResponse>(`/admin/data-subject-requests${toQueryString(filters)}`, { signal });
}

export function getDataSubjectRequest(id: string, signal?: AbortSignal): Promise<AdminDataSubjectRequest> {
  return apiClient.get<AdminDataSubjectRequest>(`/admin/data-subject-requests/${id}`, { signal });
}

export function assignDataSubjectRequest(id: string, assignedUserId: string): Promise<AdminDataSubjectRequest> {
  return apiClient.patch<AdminDataSubjectRequest>(`/admin/data-subject-requests/${id}/assign`, { assignedUserId });
}

export interface TransitionDataSubjectRequestInput {
  status: string;
  notes: string;
  resolution?: string;
}

export function transitionDataSubjectRequest(id: string, input: TransitionDataSubjectRequestInput): Promise<AdminDataSubjectRequest> {
  return apiClient.post<AdminDataSubjectRequest>(`/admin/data-subject-requests/${id}/transition`, input);
}
