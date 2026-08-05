import { getStoredCookieConsent } from "./cookie-consent-storage";
import type { CookieCategory } from "./cookie-consent-types";

export function hasCookieConsent(category: CookieCategory): boolean {
  return getStoredCookieConsent()?.[category] === true;
}

export interface ScriptAttributes {
  async?: boolean;
  defer?: boolean;
  id?: string;
}

/**
 * US-047 AC: "No analytics/marketing script tag is injected into the DOM
 * until its corresponding category is GRANTED." No analytics or
 * marketing provider is confirmed anywhere in the PRD or codebase today
 * - this is the gating mechanism a future, confirmed integration calls
 * before injecting its own script; nothing in this app calls it with a
 * real vendor script yet, and none should be invented here.
 */
export function loadScriptIfConsented(category: CookieCategory, src: string, attrs: ScriptAttributes = {}): void {
  if (!hasCookieConsent(category)) return;
  if (document.querySelector(`script[src="${src}"]`)) return;

  const script = document.createElement("script");
  script.src = src;
  if (attrs.async) script.async = true;
  if (attrs.defer) script.defer = true;
  if (attrs.id) script.id = attrs.id;
  document.head.appendChild(script);
}
