import { createHash } from "node:crypto";

/**
 * Recursively sorts object keys so semantically identical payloads hash
 * identically regardless of property order (real HTTP retries from a
 * third party are not guaranteed to re-serialize with the same key
 * order as the original delivery).
 */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value !== null && typeof value === "object") {
    const sortedKeys = Object.keys(value as Record<string, unknown>).sort();
    const result: Record<string, unknown> = {};
    for (const key of sortedKeys) {
      result[key] = canonicalize((value as Record<string, unknown>)[key]);
    }
    return result;
  }
  return value;
}

/**
 * A duplicate webhook delivery (PRD rule) is Bold re-sending the exact
 * same event, not a new status for the same order - hashing the full
 * canonicalized payload (not just reference_id) correctly treats two
 * different statuses for the same order as two different events, while
 * a byte-identical (modulo key order) retry always collapses to the
 * same key, which PaymentEvent.idempotencyKey's unique constraint then
 * enforces at the database level.
 */
export function computeWebhookIdempotencyKey(payload: unknown): string {
  const canonicalJson = JSON.stringify(canonicalize(payload));
  return createHash("sha256").update(canonicalJson).digest("hex");
}
