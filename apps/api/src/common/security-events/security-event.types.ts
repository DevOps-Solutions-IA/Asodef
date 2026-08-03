import type { SecurityEventType } from "@prisma/client";

export { SecurityEventType };

/**
 * Safe, JSON-serializable contextual data attached to a SecurityEvent.
 * Never put a password, access token, refresh token, cookie value, or
 * token hash in here - only identifiers and category labels.
 */
export type SecurityEventMetadata = Record<string, string | number | boolean | null>;

export interface RecordSecurityEventInput {
  type: SecurityEventType;
  userId?: string | null;
  sessionId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
  metadata?: SecurityEventMetadata;
}
