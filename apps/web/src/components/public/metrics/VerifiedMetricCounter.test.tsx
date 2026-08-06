import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BENEFITS } from "../../../lib/public-content/benefits";
import { VerifiedMetricCounter } from "./VerifiedMetricCounter";
import { getVerifiedPublicMetric, VERIFIED_PUBLIC_METRICS } from "./verified-public-metrics";

function useMotionPreference(reduced: boolean) {
  vi.stubGlobal("matchMedia", vi.fn().mockImplementation(() => ({ matches: reduced, media: "(prefers-reduced-motion: reduce)", onchange: null, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn() })));
}

describe("verified public metrics", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("maps every figure to a deterministic source", () => {
    expect(getVerifiedPublicMetric("benefit-categories")?.value).toBe(BENEFITS.length);
    expect(getVerifiedPublicMetric("published-legal-documents")?.value).toBe(21);
    for (const metric of VERIFIED_PUBLIC_METRICS) {
      expect(metric.value).toBeGreaterThan(0);
      expect(metric.source.path).not.toBe("");
      expect(metric.source.derivation).not.toBe("");
    }
  });

  it("exposes the accessible final value even before visual count-up", () => {
    useMotionPreference(false);
    const metric = VERIFIED_PUBLIC_METRICS[0];
    render(<VerifiedMetricCounter metric={metric} />);
    expect(screen.getByText(String(metric.value), { selector: ".sr-only" })).toBeInTheDocument();
    expect(screen.getByText(metric.label)).toBeInTheDocument();
  });

  it("shows the final visual value immediately with reduced motion", () => {
    useMotionPreference(true);
    const metric = VERIFIED_PUBLIC_METRICS[1];
    render(<VerifiedMetricCounter metric={metric} />);
    expect(screen.getByText("21", { selector: "[aria-hidden='true']" })).toBeVisible();
  });
});
