export type AuditTimelineSource = "AUDIT" | "SECURITY";
export type AuditTimelineResult = "SUCCESS" | "FAILURE" | "DENIED" | "NO_OP" | "UNKNOWN";

export interface AuditTimelineItem {
  id: string;
  source: AuditTimelineSource;
  action: string;
  result: AuditTimelineResult;
  timestamp: Date;
  actorId: string | null;
  entityType: string | null;
  entityId: string | null;
  previousState: string | null;
  newState: string | null;
  reason: string | null;
  requestId: string | null;
  correlationId: string | null;
}

export interface AuditTimelinePage {
  items: AuditTimelineItem[];
  total: number;
  pageSize: number;
  nextCursor: string | null;
}
