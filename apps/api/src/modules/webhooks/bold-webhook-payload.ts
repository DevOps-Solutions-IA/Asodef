export interface BoldWebhookPayload {
  [key: string]: unknown;
}

export interface NormalizedBoldWebhookPayload {
  format: "official" | "legacy";
  notificationId: string | null;
  eventType: string;
  reference: string | null;
  providerStatus: string | null;
  transactionId: string | null;
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function providerStatusForEventType(eventType: string): string | null {
  if (eventType === "SALE_APPROVED") return "APPROVED";
  if (eventType === "SALE_REJECTED") return "REJECTED";
  return null;
}

/**
 * Normalizes Bold's current documented notification shape while retaining the
 * old reference_id/status shape only for existing mock-mode compatibility.
 * Real signed production notifications are expected to use the official shape:
 * id + type + data.metadata.reference (+ data.payment_id/subject).
 */
export function normalizeBoldWebhookPayload(payload: unknown): NormalizedBoldWebhookPayload | null {
  const root = objectValue(payload);
  if (!root) return null;

  const notificationId = stringValue(root.id);
  const eventType = stringValue(root.type);
  const data = objectValue(root.data);

  if (notificationId && eventType && data) {
    const metadata = objectValue(data.metadata);
    const reference = metadata ? stringValue(metadata.reference) : null;
    return {
      format: "official",
      notificationId,
      eventType,
      reference,
      providerStatus: providerStatusForEventType(eventType),
      transactionId: stringValue(data.payment_id) ?? stringValue(root.subject),
    };
  }

  const legacyReference = stringValue(root.reference_id);
  const legacyStatus = stringValue(root.status);
  if (legacyReference && legacyStatus) {
    return {
      format: "legacy",
      notificationId: null,
      eventType: "LEGACY_STATUS",
      reference: legacyReference,
      providerStatus: legacyStatus,
      transactionId: null,
    };
  }

  return null;
}

export function isValidBoldWebhookPayload(payload: unknown): payload is BoldWebhookPayload {
  return normalizeBoldWebhookPayload(payload) !== null;
}
