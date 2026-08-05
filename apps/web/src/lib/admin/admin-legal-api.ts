import { apiClient } from "../api-client";
import type { AdminLegalDocument, AdminLegalDocumentSummary, AdminLegalDocumentVersion } from "./admin-legal-types";

export function listLegalDocuments(signal?: AbortSignal): Promise<AdminLegalDocumentSummary[]> {
  return apiClient.get<AdminLegalDocumentSummary[]>("/admin/legal-documents", { signal });
}

export function getLegalDocument(documentId: string, signal?: AbortSignal): Promise<AdminLegalDocument> {
  return apiClient.get<AdminLegalDocument>(`/admin/legal-documents/${documentId}`, { signal });
}

export function createLegalDocumentVersion(
  documentId: string,
  draftContent: Record<string, unknown>,
  changeSummary?: string,
): Promise<AdminLegalDocumentVersion> {
  return apiClient.post<AdminLegalDocumentVersion>(`/admin/legal-documents/${documentId}/versions`, { draftContent, changeSummary });
}

export function updateLegalDocumentDraft(versionId: string, draftContent: Record<string, unknown>): Promise<AdminLegalDocumentVersion> {
  return apiClient.patch<AdminLegalDocumentVersion>(`/admin/legal-documents/versions/${versionId}`, { draftContent });
}

export function submitLegalDocumentForReview(versionId: string): Promise<AdminLegalDocumentVersion> {
  return apiClient.post<AdminLegalDocumentVersion>(`/admin/legal-documents/versions/${versionId}/submit-for-review`, {});
}

export function submitLegalDocumentForApproval(versionId: string): Promise<AdminLegalDocumentVersion> {
  return apiClient.post<AdminLegalDocumentVersion>(`/admin/legal-documents/versions/${versionId}/submit-for-approval`, {});
}

export function rejectLegalDocumentVersion(versionId: string): Promise<AdminLegalDocumentVersion> {
  return apiClient.post<AdminLegalDocumentVersion>(`/admin/legal-documents/versions/${versionId}/reject`, {});
}

export function approveLegalDocumentVersion(versionId: string): Promise<AdminLegalDocumentVersion> {
  return apiClient.post<AdminLegalDocumentVersion>(`/admin/legal-documents/versions/${versionId}/approve`, {});
}

export function publishLegalDocumentVersion(versionId: string): Promise<AdminLegalDocumentVersion> {
  return apiClient.post<AdminLegalDocumentVersion>(`/admin/legal-documents/versions/${versionId}/publish`, {});
}
