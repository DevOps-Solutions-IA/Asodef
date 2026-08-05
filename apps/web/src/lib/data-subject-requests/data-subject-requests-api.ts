import { apiClient } from "../api-client";
import type { CreateDataSubjectRequestPayload, PublicDataSubjectRequest } from "./data-subject-requests-types";

export function submitDataSubjectRequest(payload: CreateDataSubjectRequestPayload): Promise<PublicDataSubjectRequest> {
  return apiClient.post<PublicDataSubjectRequest>("/data-subject-requests", payload);
}

export function lookupDataSubjectRequest(publicReference: string): Promise<PublicDataSubjectRequest> {
  return apiClient.get<PublicDataSubjectRequest>(`/data-subject-requests/${encodeURIComponent(publicReference)}`);
}
