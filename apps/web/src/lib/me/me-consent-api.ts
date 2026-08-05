import { apiClient } from "../api-client";
import type { MyConsentRecord } from "./me-consent-types";

export interface RevokedConsentRecord {
  id: string;
  purposeKey: string;
  status: string;
  legalDocumentVersionId: string | null;
  createdAt: string;
  revokedAt: string | null;
}

export function getMyConsentRecords(signal?: AbortSignal): Promise<MyConsentRecord[]> {
  return apiClient.get<MyConsentRecord[]>("/me/consent-records", { signal });
}

export function revokeMyConsent(purposeKey: string): Promise<RevokedConsentRecord> {
  return apiClient.post<RevokedConsentRecord>(`/me/consent-records/${encodeURIComponent(purposeKey)}/revoke`);
}
