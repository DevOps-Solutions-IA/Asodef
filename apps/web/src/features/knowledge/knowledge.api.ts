import { apiClient } from "../../lib/api-client";
import type { DraftInput, KnowledgeDiff, KnowledgeFilters, KnowledgeItem, KnowledgeListResponse, KnowledgeRetrievalResult, KnowledgeVersion } from "./knowledge.types";

const base = "/admin/knowledge";

function queryString(filters: KnowledgeFilters): string {
  const query = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== "") query.set(key, String(value));
  });
  return query.toString();
}

export const listKnowledgeItems = (filters: KnowledgeFilters, signal?: AbortSignal) => apiClient.get<KnowledgeListResponse>(`${base}/items?${queryString(filters)}`, { signal });
export const getKnowledgeItem = (id: string, signal?: AbortSignal) => apiClient.get<KnowledgeItem>(`${base}/items/${id}`, { signal });
export const getKnowledgeDiff = (versionId: string) => apiClient.post<KnowledgeDiff>(`${base}/versions/${versionId}/diff`);
export const createManualDraft = (input: DraftInput) => apiClient.post<KnowledgeVersion>(`${base}/versions/manual`, input);
export function createFileDraft(input: DraftInput, file: File): Promise<KnowledgeVersion> {
  const form = new FormData();
  Object.entries(input).forEach(([key, value]) => {
    if (value !== undefined && key !== "content") form.set(key, String(value));
  });
  form.set("file", file);
  return apiClient.post<KnowledgeVersion>(`${base}/versions/file`, form);
}
export const transitionKnowledge = (versionId: string, action: "submit-review" | "return-draft" | "approve" | "publish" | "retire", expectedRevision: number, changeReason: string) => apiClient.post<KnowledgeVersion>(`${base}/versions/${versionId}/${action}`, { expectedRevision, changeReason });
export const previewKnowledge = (versionId: string, query: string) => apiClient.post<{ preview: true; statusUnchanged: string; outcome: string; citations: Array<{ excerpt: string; score: number }> }>(`${base}/versions/${versionId}/preview`, { query, limit: 10 });
export const retrievePublishedKnowledge = (query: string, domainKeys: string[]) => apiClient.post<KnowledgeRetrievalResult>(`${base}/retrieval`, { query, domainKeys, limit: 10 });
