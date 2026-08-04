/**
 * Bold's webhook body shape isn't fully confirmed (PRD openQuestions -
 * the webhook-specific docs page returned 404), so this deliberately
 * does NOT go through the app's global ValidationPipe (whitelist:true,
 * forbidNonWhitelisted:true would silently strip or reject any
 * unconfirmed field Bold actually sends). Only the two field names
 * already confirmed elsewhere in this project's Bold integration
 * (reference_id, status - both used verbatim by BoldTransport/
 * BoldPaymentProvider since US-022) are required; everything else in
 * the payload is preserved as-is for storage/hashing, never asserted.
 */
export interface BoldWebhookPayload {
  reference_id: string;
  status: string;
  [key: string]: unknown;
}

export function isValidBoldWebhookPayload(payload: unknown): payload is BoldWebhookPayload {
  if (payload === null || typeof payload !== "object") return false;
  const candidate = payload as Record<string, unknown>;
  return (
    typeof candidate.reference_id === "string" &&
    candidate.reference_id.length > 0 &&
    typeof candidate.status === "string" &&
    candidate.status.length > 0
  );
}
