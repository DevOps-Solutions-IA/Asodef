import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { CoverageSection } from "./CoverageSection";

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

const threeCards = [
  {
    title: "Sede principal",
    body: "Nuestra sede principal se encuentra en Cali, desde donde coordinamos la atención y el acompañamiento institucional.",
  },
  { title: "Atención cercana", body: "Orientamos a personas, familias y organizaciones mediante canales de atención claros, humanos y responsables." },
  { title: "Acompañamiento institucional", body: "Facilitamos información y orientación para que cada persona pueda conocer y acceder a los servicios disponibles." },
];

describe("CoverageSection", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders nothing when neither heading nor cards are supplied - never invents institutional copy", () => {
    mockPrefersReducedMotion(false);
    const { container } = render(<CoverageSection />);
    expect(container).toBeEmptyDOMElement();
  });

  it("anchors the section at #cobertura", () => {
    mockPrefersReducedMotion(false);
    const { container } = render(<CoverageSection heading="Desde Cali, trabajamos cerca de ti" />);
    expect(container.querySelector("section#cobertura")).toBeInTheDocument();
  });

  it("renders the heading as an h2, never a page-level h1", () => {
    mockPrefersReducedMotion(false);
    render(<CoverageSection heading="Desde Cali, trabajamos cerca de ti" />);

    expect(screen.getByRole("heading", { level: 2, name: "Desde Cali, trabajamos cerca de ti" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
  });

  it("renders the Colombia map image as decorative (empty alt, aria-hidden)", () => {
    mockPrefersReducedMotion(false);
    render(<CoverageSection heading="Desde Cali, trabajamos cerca de ti" />);

    const map = document.querySelector("img")!;
    expect(map).toHaveAttribute("alt", "");
    expect(map).toHaveAttribute("aria-hidden", "true");
    expect(map.getAttribute("src")).toMatch(/colombia-map/);
  });

  it("states Cali as headquarters in real visible text (not only inside the decorative map)", () => {
    mockPrefersReducedMotion(false);
    render(<CoverageSection heading="Desde Cali, trabajamos cerca de ti" cards={threeCards} />);
    expect(screen.getByText(/sede principal se encuentra en Cali/i)).toBeInTheDocument();
  });

  it("renders exactly three cards with their approved titles and bodies", () => {
    mockPrefersReducedMotion(false);
    render(<CoverageSection cards={threeCards} />);

    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(3);
    for (const card of threeCards) {
      expect(screen.getByRole("heading", { level: 3, name: card.title })).toBeInTheDocument();
      expect(screen.getByText(card.body)).toBeInTheDocument();
    }
  });

  it("renders at most 3 cards even when more are supplied", () => {
    mockPrefersReducedMotion(false);
    render(<CoverageSection cards={[...threeCards, { title: "Cuarta ciudad" }]} />);
    expect(screen.queryByText("Cuarta ciudad")).not.toBeInTheDocument();
  });

  it("never renders a city name other than Cali", () => {
    mockPrefersReducedMotion(false);
    const { container } = render(<CoverageSection heading="Desde Cali, trabajamos cerca de ti" cards={threeCards} />);

    for (const otherCity of ["Bogotá", "Medellín", "Barranquilla", "Bucaramanga"]) {
      expect(container.textContent).not.toContain(otherCity);
    }
  });

  it("does not render a national/coverage-percentage claim", () => {
    mockPrefersReducedMotion(false);
    const { container } = render(<CoverageSection heading="Desde Cali, trabajamos cerca de ti" cards={threeCards} />);
    expect(container.textContent).not.toMatch(/cobertura nacional|todo el país|%/i);
  });

  it("renders cards fully visible immediately when reduced motion is preferred", () => {
    mockPrefersReducedMotion(true);
    render(<CoverageSection cards={threeCards} />);

    const card = screen.getByText("Sede principal").closest("article")!;
    expect(card).toBeVisible();
    expect(card.style.opacity === "" || card.style.opacity === "1").toBe(true);
  });
});
