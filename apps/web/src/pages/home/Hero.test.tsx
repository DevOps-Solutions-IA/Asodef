import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Hero } from "./Hero";

function mockPrefersReducedMotion(matches: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

function renderHero(props: Parameters<typeof Hero>[0] = {}) {
  return render(
    <MemoryRouter>
      <Hero {...props} />
    </MemoryRouter>,
  );
}

describe("Hero", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders nothing for eyebrow/heading/supportingCopy/stats when none are supplied - never invents placeholder copy", () => {
    mockPrefersReducedMotion(false);
    renderHero({ ctas: [{ label: "Centro de pagos", href: "/pagos", variant: "primary" }] });

    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Centro de pagos" })).toBeInTheDocument();
  });

  it("renders supplied heading, eyebrow, and supporting copy verbatim", () => {
    mockPrefersReducedMotion(false);
    renderHero({
      eyebrow: "Eyebrow de prueba",
      heading: "Encabezado de prueba",
      supportingCopy: "Copy de apoyo de prueba",
    });

    expect(screen.getByRole("heading", { name: "Encabezado de prueba" })).toBeInTheDocument();
    expect(screen.getByText("Eyebrow de prueba")).toBeInTheDocument();
    expect(screen.getByText("Copy de apoyo de prueba")).toBeInTheDocument();
  });

  it("renders each CTA as a link pointing to its configured href", () => {
    mockPrefersReducedMotion(false);
    renderHero({
      ctas: [
        { label: "Centro de pagos", href: "/pagos", variant: "primary" },
        { label: "Ver portafolio", href: "#portafolio", variant: "outline" },
        { label: "Contáctanos", href: "#contacto", variant: "outline" },
      ],
    });

    expect(screen.getByRole("link", { name: "Centro de pagos" })).toHaveAttribute("href", "/pagos");
    // React Router resolves a bare "#hash" relative to the current path.
    expect(screen.getByRole("link", { name: "Ver portafolio" })).toHaveAttribute("href", "/#portafolio");
    expect(screen.getByRole("link", { name: "Contáctanos" })).toHaveAttribute("href", "/#contacto");
  });

  it("renders floating stat labels only when supplied, using the exact values given", () => {
    mockPrefersReducedMotion(false);
    renderHero({ stats: [{ value: "1.234", label: "Etiqueta de prueba" }] });

    expect(screen.getByText("1.234")).toBeInTheDocument();
    expect(screen.getByText("Etiqueta de prueba")).toBeInTheDocument();
  });

  it("gives all three stat slots a distinct position (third-stat layout)", () => {
    mockPrefersReducedMotion(false);
    renderHero({
      stats: [
        { value: "Uno", label: "Primero" },
        { value: "Dos", label: "Segundo" },
        { value: "Tres", label: "Tercero" },
      ],
    });

    const first = screen.getByText("Uno").closest("div")!;
    const second = screen.getByText("Dos").closest("div")!;
    const third = screen.getByText("Tres").closest("div")!;

    expect(new Set([first.className, second.className, third.className]).size).toBe(3);
  });

  it("renders the heading fully visible (opacity 1) immediately when reduced motion is preferred", () => {
    mockPrefersReducedMotion(true);
    renderHero({ heading: "Encabezado de prueba" });

    const heading = screen.getByRole("heading", { name: "Encabezado de prueba" });
    expect(heading).toBeVisible();
    expect(heading.style.opacity === "" || heading.style.opacity === "1").toBe(true);
  });

  it("wires the placeholder hero image at a stable path with a decorative (empty) alt", () => {
    mockPrefersReducedMotion(false);
    renderHero({});

    const image = screen.getByRole("presentation");
    expect(image.tagName).toBe("IMG");
    expect(image).toHaveAttribute("alt", "");
  });
});
