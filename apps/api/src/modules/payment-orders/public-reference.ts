import { randomBytes } from "node:crypto";

/**
 * Non-sequential, cryptographically random public reference (PRD rule:
 * "Public payment references are non-sequential, cryptographically
 * random tokens - never expose the internal auto-increment/uuid
 * ordering as a guessable sequence"). 24 random bytes -> 32 URL-safe
 * base64 characters - enough entropy that guessing/enumerating a valid
 * reference is infeasible, and short enough to appear in a URL path
 * (e.g. a future /pagos/orden/:publicReference route).
 */
export function generatePublicReference(): string {
  return randomBytes(24).toString("base64url");
}
