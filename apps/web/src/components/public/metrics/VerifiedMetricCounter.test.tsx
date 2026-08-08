import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VerifiedIndicators, VerifiedMetricCounter } from "./VerifiedMetricCounter";
import { completedYearsSince, getVerifiedPublicIndicator, VERIFIED_PUBLIC_INDICATORS } from "./verified-public-metrics";

function useMotionPreference(reduced: boolean) {
  vi.stubGlobal("matchMedia", vi.fn().mockImplementation(() => ({ matches: reduced, media: "(prefers-reduced-motion: reduce)", onchange: null, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn() })));
}

describe("verified public indicators", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("calculates completed corporate anniversaries from the verified registration date", () => {
    expect(completedYearsSince("2012-09-10", new Date("2026-08-06T12:00:00Z"))).toBe(13);
    expect(completedYearsSince("2012-09-10", new Date("2026-09-10T00:00:00Z"))).toBe(14);
    expect(getVerifiedPublicIndicator("corporate-years")?.source.field).toBe("ASODEF_COMPANY.registrationDate");
  });

  it("maps the temporal figure and three qualitative indicators to exact sources", () => {
    expect(VERIFIED_PUBLIC_INDICATORS).toHaveLength(4);
    expect(VERIFIED_PUBLIC_INDICATORS.filter((indicator) => indicator.kind === "numeric")).toHaveLength(1);
    for (const indicator of VERIFIED_PUBLIC_INDICATORS) {
      expect(indicator.source.path).toBe("packages/config/src/company.ts");
      expect(indicator.source.field).not.toBe("");
      expect(indicator.source.derivation).not.toBe("");
    }
  });

  it("exposes the accessible final value before visual count-up", () => {
    useMotionPreference(false);
    const metric = VERIFIED_PUBLIC_INDICATORS[0];
    render(<VerifiedMetricCounter metric={metric} />);
    expect(screen.getByText(String(metric.value), { selector: ".sr-only" })).toBeInTheDocument();
    expect(screen.getByText(metric.label)).toBeInTheDocument();
  });

  it("shows the final visual value immediately with reduced motion", () => {
    useMotionPreference(true);
    const metric = VERIFIED_PUBLIC_INDICATORS[0];
    render(<VerifiedMetricCounter metric={metric} />);
    expect(screen.getByText(String(metric.value), { selector: "[aria-hidden='true']" })).toBeVisible();
  });

  it("renders qualitative indicators as text without count-up semantics", () => {
    render(<VerifiedIndicators indicators={VERIFIED_PUBLIC_INDICATORS} />);
    expect(screen.getByText("2012")).toBeVisible();
    expect(screen.getByText("Cali, Colombia")).toBeVisible();
    expect(screen.getByText("S.A.S.")).toBeVisible();
    expect(screen.queryByText("categorías de beneficios")).not.toBeInTheDocument();
  });
});
