import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Heart, Users } from "lucide-react";
import { BenefitPortfolio } from "./BenefitPortfolio";

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

function renderPortfolio(props: Parameters<typeof BenefitPortfolio>[0] = {}) {
  return render(
    <MemoryRouter>
      <BenefitPortfolio {...props} />
    </MemoryRouter>,
  );
}

const eightCategories = [
  { title: "Bienestar personal", description: "Descripción uno.", icon: Heart, linkHref: "#contacto" },
  { title: "Bienestar familiar", description: "Descripción dos.", icon: Users, linkHref: "#contacto" },
  { title: "Educación y desarrollo", description: "Descripción tres.", icon: Heart, linkHref: "#contacto" },
  { title: "Hogar y protección", description: "Descripción cuatro.", icon: Heart, linkHref: "#contacto" },
  { title: "Recreación y experiencias", description: "Descripción cinco.", icon: Heart, linkHref: "#contacto" },
  { title: "Orientación y acompañamiento", description: "Descripción seis.", icon: Heart, linkHref: "#contacto" },
  { title: "Soluciones para empresas", description: "Descripción siete.", icon: Heart, linkHref: "#contacto" },
  { title: "Servicios complementarios", description: "Descripción ocho.", icon: Heart, linkHref: "#contacto" },
];

describe("BenefitPortfolio", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders nothing when neither heading nor categories are supplied - never invents institutional copy", () => {
    mockPrefersReducedMotion(false);
    const { container } = renderPortfolio();
    expect(container).toBeEmptyDOMElement();
  });

  it("anchors the section at #portafolio", () => {
    mockPrefersReducedMotion(false);
    const { container } = renderPortfolio({ heading: "Alternativas pensadas para cada necesidad" });
    expect(container.querySelector("section#portafolio")).toBeInTheDocument();
  });

  it("renders the heading as an h2, never a page-level h1", () => {
    mockPrefersReducedMotion(false);
    renderPortfolio({ heading: "Alternativas pensadas para cada necesidad" });

    expect(screen.getByRole("heading", { level: 2, name: "Alternativas pensadas para cada necesidad" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
  });

  it("renders exactly eight categories with their titles and descriptions", () => {
    mockPrefersReducedMotion(false);
    renderPortfolio({ categories: eightCategories });

    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(8);
    for (const category of eightCategories) {
      expect(screen.getByRole("heading", { level: 3, name: category.title })).toBeInTheDocument();
      expect(screen.getByText(category.description)).toBeInTheDocument();
    }
  });

  it("renders at most 8 categories even when more are supplied", () => {
    mockPrefersReducedMotion(false);
    renderPortfolio({ categories: [...eightCategories, { title: "Novena", icon: Heart, linkHref: "#contacto" }] });
    expect(screen.queryByText("Novena")).not.toBeInTheDocument();
  });

  it("renders each category's icon as decorative (aria-hidden)", () => {
    mockPrefersReducedMotion(false);
    const { container } = renderPortfolio({ categories: eightCategories });
    const icons = container.querySelectorAll('svg[aria-hidden="true"]');
    expect(icons.length).toBeGreaterThanOrEqual(8);
  });

  it("gives each 'Conocer más' link a unique accessible name including the category title", () => {
    mockPrefersReducedMotion(false);
    renderPortfolio({ categories: eightCategories });

    for (const category of eightCategories) {
      const link = screen.getByRole("link", { name: `Conocer más sobre ${category.title}` });
      expect(link).toHaveAttribute("href", "/#contacto");
      expect(link).toHaveTextContent("Conocer más");
    }
  });

  it("never renders a broken placeholder href", () => {
    mockPrefersReducedMotion(false);
    renderPortfolio({ categories: eightCategories });

    const links = screen.getAllByRole("link");
    for (const link of links) {
      const href = link.getAttribute("href");
      expect(href).not.toBe("#");
      expect(href).not.toMatch(/^javascript:/i);
    }
  });

  it("shows a visible focus outline when a portfolio link receives keyboard focus", () => {
    mockPrefersReducedMotion(false);
    renderPortfolio({ categories: eightCategories });

    const link = screen.getByRole("link", { name: `Conocer más sobre ${eightCategories[0]!.title}` });
    link.focus();
    expect(link).toHaveFocus();
    expect(link.className).toMatch(/focus-visible:ring/);
  });

  it("renders categories fully visible immediately when reduced motion is preferred", () => {
    mockPrefersReducedMotion(true);
    renderPortfolio({ categories: eightCategories });

    const card = screen.getByText("Bienestar personal").closest("article")!;
    expect(card).toBeVisible();
    expect(card.style.opacity === "" || card.style.opacity === "1").toBe(true);
  });
});
