import { createHash } from "node:crypto";
import {
  canonicalizeJson,
  type CanonicalJsonValue,
} from "../../domain/fairness/canonical-json";
import {
  BingoIdempotencyError,
  BingoIdempotencyErrorCode,
} from "./idempotency-errors";

const KEY_PATTERN = /^[A-Za-z0-9._:-]{16,200}$/;
const SCOPE_PATTERN =
  /^(event|round|execution|candidate|winner):[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function sha256(domain: string, value: string): string {
  return createHash("sha256")
    .update(domain, "utf8")
    .update("\0", "utf8")
    .update(value, "utf8")
    .digest("hex");
}

export function hashIdempotencyKey(key: string): string {
  if (!KEY_PATTERN.test(key)) {
    throw new BingoIdempotencyError(BingoIdempotencyErrorCode.INVALID_KEY);
  }
  return sha256("asodef:bingo:idempotency-key:v1", key);
}

export function hashIdempotencyRequest(request: unknown): string {
  try {
    return sha256(
      "asodef:bingo:idempotency-request:v1",
      canonicalizeJson(request as CanonicalJsonValue),
    );
  } catch {
    throw new BingoIdempotencyError(BingoIdempotencyErrorCode.INVALID_REQUEST);
  }
}

export function assertIdempotencyScope(scope: string): void {
  if (!SCOPE_PATTERN.test(scope)) {
    throw new BingoIdempotencyError(BingoIdempotencyErrorCode.INVALID_SCOPE);
  }
}
