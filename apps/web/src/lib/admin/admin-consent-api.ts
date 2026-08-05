import { apiClient } from "../api-client";
import type { AdminConsentRecord, AdminConsentRecordListResponse, SearchConsentRecordsFilters } from "./admin-consent-types";

function toQueryString(filters: object): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters as Record<string, unknown>)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

export function searchConsentRecords(filters: SearchConsentRecordsFilters, signal?: AbortSignal): Promise<AdminConsentRecordListResponse> {
  return apiClient.get<AdminConsentRecordListResponse>(`/admin/consent-records${toQueryString(filters)}`, { signal });
}

export function getConsentRecord(consentRecordId: string, signal?: AbortSignal): Promise<AdminConsentRecord> {
  return apiClient.get<AdminConsentRecord>(`/admin/consent-records/${consentRecordId}`, { signal });
}
