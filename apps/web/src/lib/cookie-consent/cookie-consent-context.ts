import { createContext, useContext } from "react";
import type { CookieConsentChoices, StoredCookieConsent } from "./cookie-consent-types";

/** Split into its own file (rather than living in
 * CookieConsentContext.tsx) purely so that file can stay a
 * component-only export for Fast Refresh - same convention as
 * lib/auth/auth-context.ts. */
export interface CookieConsentContextValue {
  consent: StoredCookieConsent | null;
  isBannerOpen: boolean;
  isPreferencesOpen: boolean;
  acceptAll: () => void;
  rejectOptional: () => void;
  savePreferences: (choices: CookieConsentChoices) => void;
  openPreferences: () => void;
  closePreferences: () => void;
}

export const CookieConsentContext = createContext<CookieConsentContextValue | null>(null);

export function useCookieConsent(): CookieConsentContextValue {
  const ctx = useContext(CookieConsentContext);
  if (!ctx) {
    throw new Error("useCookieConsent must be used within a CookieConsentProvider");
  }
  return ctx;
}
