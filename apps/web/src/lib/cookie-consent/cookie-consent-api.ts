import { apiClient } from "../api-client";
import type { CookieConsentChoices, CookieConsentMethod } from "./cookie-consent-types";

/** Best-effort durable evidence (US-047) - callers must never surface a
 * failure here to the visitor. The live client-side gating (script-gate.ts)
 * applies from the local choice alone, independent of whether this call
 * succeeds - see BLOCKED BY APPROVED LEGAL CONTENT: this 400s until a
 * real política de cookies version is published, by design. */
export async function recordCookieConsent(choices: CookieConsentChoices, method: CookieConsentMethod): Promise<void> {
  await apiClient.post<void>("/cookie-consent", { ...choices, method });
}
