import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { CookieConsentContext } from "./cookie-consent-context";
import { getStoredCookieConsent, setStoredCookieConsent } from "./cookie-consent-storage";
import { recordCookieConsent } from "./cookie-consent-api";
import type { CookieConsentChoices, CookieConsentMethod, StoredCookieConsent } from "./cookie-consent-types";

function persistAndApply(choices: CookieConsentChoices, method: CookieConsentMethod): StoredCookieConsent {
  const consent: StoredCookieConsent = { ...choices, method, decidedAt: new Date().toISOString() };
  setStoredCookieConsent(consent);
  // Fire-and-forget: never blocks or fails the visitor-facing choice -
  // see cookie-consent-api.ts's own doc comment.
  void recordCookieConsent(choices, method).catch(() => {});
  return consent;
}

/**
 * US-047: mounted once at the app root (App.tsx) so the banner/dialog
 * and script-gating are available everywhere, not just on the public
 * marketing site.
 */
export function CookieConsentProvider({ children }: { children: ReactNode }) {
  const [consent, setConsent] = useState<StoredCookieConsent | null>(null);
  const [isBannerOpen, setBannerOpen] = useState(false);
  const [isPreferencesOpen, setPreferencesOpen] = useState(false);

  useEffect(() => {
    const stored = getStoredCookieConsent();
    setConsent(stored);
    setBannerOpen(!stored);
  }, []);

  const acceptAll = useCallback(() => {
    setConsent(persistAndApply({ preferences: true, analytics: true, marketing: true }, "accept_all"));
    setBannerOpen(false);
    setPreferencesOpen(false);
  }, []);

  const rejectOptional = useCallback(() => {
    setConsent(persistAndApply({ preferences: false, analytics: false, marketing: false }, "reject_optional"));
    setBannerOpen(false);
    setPreferencesOpen(false);
  }, []);

  const savePreferences = useCallback((choices: CookieConsentChoices) => {
    setConsent(persistAndApply(choices, "customize"));
    setBannerOpen(false);
    setPreferencesOpen(false);
  }, []);

  const openPreferences = useCallback(() => setPreferencesOpen(true), []);
  const closePreferences = useCallback(() => setPreferencesOpen(false), []);

  return (
    <CookieConsentContext.Provider
      value={{ consent, isBannerOpen, isPreferencesOpen, acceptAll, rejectOptional, savePreferences, openPreferences, closePreferences }}
    >
      {children}
    </CookieConsentContext.Provider>
  );
}
