import type { AuditEventResult, SecurityEventType } from "@prisma/client";

export { SecurityEventType };

/**
 * Safe, JSON-serializable contextual data attached to a SecurityEvent.
 * Never put a password, access token, refresh token, cookie value, or
 * token hash in here - only identifiers and category labels.
 */
export type SecurityEventMetadata = Record<string, string | number | boolean | null>;

export interface RecordSecurityEventInput {
  type: SecurityEventType;
  /** Legacy subject/actor field retained for source compatibility. New
   * security-sensitive writers should also populate the explicit fields. */
  userId?: string | null;
  actorUserId?: string | null;
  subjectUserId?: string | null;
  sessionId?: string | null;
  result?: AuditEventResult | null;
  reason?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
  correlationId?: string | null;
  metadata?: SecurityEventMetadata;
}
