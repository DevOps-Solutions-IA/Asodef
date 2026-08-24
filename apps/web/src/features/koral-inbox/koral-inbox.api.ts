import { apiClient } from "../../lib/api-client";
import type { ConversationPriority, InboxAssignee, InboxConversationDetail, InboxFilters, InboxListResponse, InboxMutationInput } from "./koral-inbox.types";

const base = "/admin/koral/conversations";
export const koralInboxKeys = {
  all: ["admin", "koral", "inbox"] as const,
  list: (filters: InboxFilters) => ["admin", "koral", "inbox", "list", filters] as const,
  detail: (id: string) => ["admin", "koral", "inbox", "detail", id] as const,
  assignees: ["admin", "koral", "inbox", "assignees"] as const,
};

function queryString(filters: InboxFilters): string {
  const query = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== "") query.set(key, String(value));
  });
  return query.toString();
}

export function listInboxConversations(filters: InboxFilters, signal?: AbortSignal): Promise<InboxListResponse> {
  const query = queryString(filters);
  return apiClient.get<InboxListResponse>(`${base}${query ? `?${query}` : ""}`, { signal });
}
export function getInboxConversation(id: string, signal?: AbortSignal): Promise<InboxConversationDetail> {
  return apiClient.get<InboxConversationDetail>(`${base}/${id}`, { signal });
}
export function listEligibleAssignees(signal?: AbortSignal): Promise<InboxAssignee[]> {
  return apiClient.get<InboxAssignee[]>(`${base}/eligible-assignees`, { signal });
}
export function assignConversation(id: string, input: InboxMutationInput & { assigneeUserId: string; priority: ConversationPriority }) {
  return apiClient.post(`${base}/${id}/assignments`, input);
}
export function releaseConversation(id: string, input: InboxMutationInput) {
  return apiClient.post(`${base}/${id}/release`, input);
}
export function returnConversationToKoral(id: string, input: InboxMutationInput) {
  return apiClient.post(`${base}/${id}/return-to-koral`, input);
}
export function changeConversationPriority(id: string, input: InboxMutationInput & { priority: ConversationPriority }) {
  return apiClient.post(`${base}/${id}/priority`, input);
}
export function transitionConversationStatus(id: string, input: InboxMutationInput & { targetStatus: "RESOLVED" | "CLOSED" }) {
  return apiClient.post(`${base}/${id}/status-transitions`, input);
}
export function addConversationNote(id: string, body: string) {
  return apiClient.post(`${base}/${id}/internal-notes`, { body, idempotencyKey: crypto.randomUUID() });
}
export function markConversationRead(id: string) {
  return apiClient.post(`${base}/${id}/read`, {});
}
