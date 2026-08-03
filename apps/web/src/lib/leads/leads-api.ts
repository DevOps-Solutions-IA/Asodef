import { apiClient } from "../api-client";
import type { CreateLeadRequest, LeadSubmissionResponse } from "./leads-types";

export function submitLead(request: CreateLeadRequest): Promise<LeadSubmissionResponse> {
  return apiClient.post<LeadSubmissionResponse>("/leads", request);
}
