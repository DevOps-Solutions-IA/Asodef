import { apiClient } from "../api-client";
import type { CreatePqrCasePayload, PublicPqrCase } from "./pqr-cases-types";

export function submitPqrCase(payload: CreatePqrCasePayload): Promise<PublicPqrCase> {
  return apiClient.post<PublicPqrCase>("/pqr-cases", payload);
}

export function lookupPqrCase(caseNumber: string): Promise<PublicPqrCase> {
  return apiClient.get<PublicPqrCase>(`/pqr-cases/${encodeURIComponent(caseNumber)}`);
}
