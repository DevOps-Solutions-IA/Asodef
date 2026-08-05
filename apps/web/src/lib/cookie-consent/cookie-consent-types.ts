export type CookieCategory = "preferences" | "analytics" | "marketing";
export type CookieConsentMethod = "accept_all" | "reject_optional" | "customize";

export interface CookieConsentChoices {
  preferences: boolean;
  analytics: boolean;
  marketing: boolean;
}

export interface StoredCookieConsent extends CookieConsentChoices {
  method: CookieConsentMethod;
  decidedAt: string;
}
