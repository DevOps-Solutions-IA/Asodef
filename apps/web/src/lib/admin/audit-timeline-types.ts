export type AuditTimelineSource = "ALL" | "AUDIT" | "SECURITY";
export type AuditTimelineResult = "SUCCESS" | "NO_OP" | "UNKNOWN";

export interface AuditTimelineFilters {
  source: AuditTimelineSource;
  action?: string;
  result?: AuditTimelineResult;
  from?: string;
  to?: string;
  cursor?: string;
  pageSize: number;
}

export interface AuditTimelineItem {
  id: string;
  source: Exclude<AuditTimelineSource, "ALL">;
  action: string;
  result: AuditTimelineResult;
  timestamp: string;
  actorId: string | null;
  entityType: string | null;
  entityId: string | null;
  previousState: string | null;
  newState: string | null;
  requestId: string | null;
  correlationId: string | null;
}

export interface AuditTimelinePage {
  items: AuditTimelineItem[];
  total: number;
  pageSize: number;
  nextCursor: string | null;
}
