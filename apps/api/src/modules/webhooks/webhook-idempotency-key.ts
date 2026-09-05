import { createHash } from "node:crypto";

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    const sortedKeys = Object.keys(value as Record<string, unknown>).sort();
    const result: Record<string, unknown> = {};
    for (const key of sortedKeys) result[key] = canonicalize((value as Record<string, unknown>)[key]);
    return result;
  }
  return value;
}

/**
 * Current Bold notifications include a unique top-level `id`; use it as the
 * stable delivery identity so a retry remains idempotent even if serialization
 * differs. Legacy/mock payloads do not have that field, so they retain the
 * canonical-payload SHA-256 fallback used by the existing test contract.
 */
export function computeWebhookIdempotencyKey(payload: unknown): string {
  if (payload !== null && typeof payload === "object" && !Array.isArray(payload)) {
    const id = (payload as Record<string, unknown>).id;
    if (typeof id === "string" && id.length > 0) return `bold-notification:${id}`;
  }

  const canonicalJson = JSON.stringify(canonicalize(payload));
  return createHash("sha256").update(canonicalJson).digest("hex");
}
