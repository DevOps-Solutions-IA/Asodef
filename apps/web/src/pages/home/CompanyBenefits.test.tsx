import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { CompanyBenefits } from "./CompanyBenefits";

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

describe("CompanyBenefits", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders nothing when neither heading nor cards are supplied - never invents institutional copy", () => {
    mockPrefersReducedMotion(false);
    const { container } = render(<CompanyBenefits />);
    expect(container).toBeEmptyDOMElement();
  });

  it("anchors the section at #beneficios", () => {
    mockPrefersReducedMotion(false);
    const { container } = render(<CompanyBenefits heading="Soluciones que aportan bienestar y valor" />);
    expect(container.querySelector("section#beneficios")).toBeInTheDocument();
  });

  it("renders the heading as an h2, never a page-level h1", () => {
    mockPrefersReducedMotion(false);
    render(<CompanyBenefits heading="Soluciones que aportan bienestar y valor" />);

    expect(screen.getByRole("heading", { level: 2, name: "Soluciones que aportan bienestar y valor" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
  });

  const sixCards = [
    { title: "Atención cercana", body: "Cuerpo uno." },
    { title: "Soluciones flexibles", body: "Cuerpo dos." },
    { title: "Bienestar familiar", body: "Cuerpo tres." },
    { title: "Gestión responsable", body: "Cuerpo cuatro." },
    { title: "Acompañamiento continuo", body: "Cuerpo cinco." },
    { title: "Relaciones de confianza", body: "Cuerpo seis." },
  ];

  it("renders exactly six numbered cards, 01 through 06, with their titles and bodies", () => {
    mockPrefersReducedMotion(false);
    render(<CompanyBenefits cards={sixCards} />);

    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(6);
    for (const [index, card] of sixCards.entries()) {
      expect(screen.getByRole("heading", { level: 3, name: card.title })).toBeInTheDocument();
      expect(screen.getByText(card.body)).toBeInTheDocument();
      expect(screen.getByText(String(index + 1).padStart(2, "0"))).toBeInTheDocument();
    }
  });

  it("renders at most 6 cards even when more are supplied", () => {
    mockPrefersReducedMotion(false);
    render(<CompanyBenefits cards={[...sixCards, { title: "Séptima" }]} />);
    expect(screen.queryByText("Séptima")).not.toBeInTheDocument();
  });

  it("has no focusable elements inside the informational cards - nothing to keyboard-trap", () => {
    mockPrefersReducedMotion(false);
    const { container } = render(<CompanyBenefits cards={sixCards} />);
    expect(container.querySelectorAll("a, button, input, select, textarea, [tabindex]")).toHaveLength(0);
  });

  it("renders cards fully visible immediately when reduced motion is preferred", () => {
    mockPrefersReducedMotion(true);
    render(<CompanyBenefits cards={sixCards} />);

    const card = screen.getByText("Atención cercana").closest("article")!;
    expect(card).toBeVisible();
    expect(card.style.opacity === "" || card.style.opacity === "1").toBe(true);
  });
});
