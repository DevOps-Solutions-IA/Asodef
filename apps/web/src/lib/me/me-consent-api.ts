import { apiClient } from "../api-client";
import type { MyConsentRecord } from "./me-consent-types";

export function getMyConsentRecords(signal?: AbortSignal): Promise<MyConsentRecord[]> {
  return apiClient.get<MyConsentRecord[]>("/me/consent-records", { signal });
}
