import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hasCookieConsent, loadScriptIfConsented } from "./script-gate";
import { setStoredCookieConsent } from "./cookie-consent-storage";
import type { StoredCookieConsent } from "./cookie-consent-types";

function grantOnly(...categories: Array<"preferences" | "analytics" | "marketing">) {
  const consent: StoredCookieConsent = {
    preferences: categories.includes("preferences"),
    analytics: categories.includes("analytics"),
    marketing: categories.includes("marketing"),
    method: "customize",
    decidedAt: new Date().toISOString(),
  };
  setStoredCookieConsent(consent);
}

describe("script-gate", () => {
  beforeEach(() => {
    localStorage.clear();
    document.head.querySelectorAll("script[data-test-gate]").forEach((el) => el.remove());
  });

  afterEach(() => {
    localStorage.clear();
    document.head.querySelectorAll("script[data-test-gate]").forEach((el) => el.remove());
  });

  it("hasCookieConsent is false for every category with no stored decision", () => {
    expect(hasCookieConsent("analytics")).toBe(false);
    expect(hasCookieConsent("marketing")).toBe(false);
    expect(hasCookieConsent("preferences")).toBe(false);
  });

  it("Example (AC): does not inject a script for a category that hasn't been granted", () => {
    grantOnly("preferences");

    loadScriptIfConsented("marketing", "https://example.com/marketing-test.js", { id: "test-gate" });

    expect(document.getElementById("test-gate")).toBeNull();
  });

  it("Negative case (AC): granting only 'analytics' does not load a marketing script", () => {
    grantOnly("analytics");

    loadScriptIfConsented("analytics", "https://example.com/analytics-test.js", { id: "test-gate-analytics" });
    loadScriptIfConsented("marketing", "https://example.com/marketing-test.js", { id: "test-gate-marketing" });

    expect(document.getElementById("test-gate-analytics")).not.toBeNull();
    expect(document.getElementById("test-gate-marketing")).toBeNull();
  });

  it("injects the script exactly once even if called twice for the same src", () => {
    grantOnly("analytics");

    loadScriptIfConsented("analytics", "https://example.com/analytics-test.js");
    loadScriptIfConsented("analytics", "https://example.com/analytics-test.js");

    const matches = document.head.querySelectorAll('script[src="https://example.com/analytics-test.js"]');
    expect(matches).toHaveLength(1);
    matches.forEach((el) => el.remove());
  });
});
