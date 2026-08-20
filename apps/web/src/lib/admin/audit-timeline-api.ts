import { apiClient } from "../api-client";
import type { AuditTimelineFilters, AuditTimelinePage } from "./audit-timeline-types";

export function listAuditTimeline(filters: AuditTimelineFilters, signal?: AbortSignal): Promise<AuditTimelinePage> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === "") continue;
    params.set(key, String(value));
  }
  return apiClient.get<AuditTimelinePage>(`/admin/auditoria?${params.toString()}`, { signal });
}
