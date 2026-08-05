import type { StoredCookieConsent } from "./cookie-consent-types";

/**
 * localStorage, not a cookie with an invented expiry - no confirmed
 * retention period for "how long before we ask again" exists anywhere
 * in the PRD, and inventing one (the common "6-12 months" convention
 * elsewhere) would be exactly the kind of unconfirmed regulatory
 * interpretation this project never fabricates. localStorage persists
 * across visits with no expiry field to invent, while still being
 * reset if the visitor clears site data - a reasonable, uncommitted
 * default until a real retention period is confirmed.
 */
const STORAGE_KEY = "asodef.cookieConsent";

export function getStoredCookieConsent(): StoredCookieConsent | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredCookieConsent;
  } catch {
    return null;
  }
}

export function setStoredCookieConsent(consent: StoredCookieConsent): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(consent));
  } catch {
    // Private browsing / storage quota - the banner simply reappears
    // next visit; the current session's in-memory gating still works.
  }
}
