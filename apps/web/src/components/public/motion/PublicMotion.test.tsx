import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InteractiveSurface, SafeReveal } from "./PublicMotion";

function useMotionPreference(reduced: boolean) {
  vi.stubGlobal("matchMedia", vi.fn().mockImplementation(() => ({ matches: reduced, media: "(prefers-reduced-motion: reduce)", onchange: null, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn() })));
}

describe("safe public motion", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("keeps reveal content visible before intersection", () => {
    useMotionPreference(false);
    render(<SafeReveal><p>Acción disponible</p></SafeReveal>);
    const wrapper = screen.getByText("Acción disponible").parentElement;
    expect(wrapper).toHaveStyle({ opacity: "0.96" });
    expect(wrapper).not.toHaveStyle({ opacity: "0" });
  });

  it("renders the final state immediately under reduced motion", () => {
    useMotionPreference(true);
    render(<SafeReveal><p>Estado final</p></SafeReveal>);
    const wrapper = screen.getByText("Estado final").parentElement;
    expect(wrapper).not.toHaveStyle({ transform: "translateY(8px)" });
    expect(screen.getByText("Estado final")).toBeVisible();
  });

  it("does not attach transform interactions when reduced motion is active", () => {
    useMotionPreference(true);
    render(<InteractiveSurface><button>Gestionar</button></InteractiveSurface>);
    expect(screen.getByRole("button", { name: "Gestionar" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Gestionar" }).parentElement).not.toHaveStyle({ transform: "translateY(-3px)" });
  });
});
