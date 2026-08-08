import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppPreloader } from "./AppPreloader";
import { shouldShowInitialPreloader } from "./preloader-utils";

describe("AppPreloader", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("is initial-load only and leaves the protected Legal Center untouched", () => {
    expect(shouldShowInitialPreloader("/")).toBe(true);
    expect(shouldShowInitialPreloader("/beneficios/plan-exequial-familiar")).toBe(true);
    expect(shouldShowInitialPreloader("/legal")).toBe(false);
    expect(shouldShowInitialPreloader("/legal/politica-de-privacidad")).toBe(false);
  });

  it("renders an accessible institutional loading state", () => {
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    render(<AppPreloader pathname="/" />);
    expect(screen.getByRole("status", { name: /ASODEF está preparando/i })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "ASODEF S.A.S." })).toBeVisible();
  });

  it("does not render over protected legal routes", () => {
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    render(<AppPreloader pathname="/legal" />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
