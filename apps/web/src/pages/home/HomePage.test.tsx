import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HomePage } from "./HomePage";

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

function renderHomePage() {
  return render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>,
  );
}

describe("HomePage - approved Hero copy (US-012)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the approved eyebrow text exactly", () => {
    mockPrefersReducedMotion(false);
    renderHomePage();
    expect(screen.getByText("ASODEF · Asociación para el desarrollo familiar")).toBeInTheDocument();
  });

  it("renders exactly one page-level h1 containing the complete heading, with the highlighted phrase visually marked", () => {
    mockPrefersReducedMotion(false);
    renderHomePage();

    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);

    const h1 = headings[0]!;
    expect(h1).toHaveTextContent("Soluciones que fortalecen el bienestar y desarrollo de las familias");

    const highlighted = screen.getByText("bienestar y desarrollo");
    expect(highlighted.tagName).toBe("SPAN");
    expect(highlighted).toHaveClass("text-brand-orange");
    expect(h1).toContainElement(highlighted);
  });

  it("renders the approved supporting paragraph exactly", () => {
    mockPrefersReducedMotion(false);
    renderHomePage();
    expect(
      screen.getByText(
        "Acompañamos a personas, familias y organizaciones con una atención cercana, responsable y orientada a construir bienestar.",
      ),
    ).toBeInTheDocument();
  });

  it("renders all three CTAs with the approved labels pointing to their real targets", () => {
    mockPrefersReducedMotion(false);
    renderHomePage();

    expect(screen.getByRole("link", { name: "Centro de pagos" })).toHaveAttribute("href", "/pagos");
    // React Router resolves a bare "#hash" relative to the current path ("/").
    expect(screen.getByRole("link", { name: "Conoce nuestro portafolio" })).toHaveAttribute("href", "/#portafolio");
    expect(screen.getByRole("link", { name: "Contáctanos" })).toHaveAttribute("href", "/#contacto");
  });

  it("renders all three approved floating labels as qualitative institutional messages, not invented statistics", () => {
    mockPrefersReducedMotion(false);
    renderHomePage();

    expect(screen.getByText("Cercanía")).toBeInTheDocument();
    expect(screen.getByText("Atención humana")).toBeInTheDocument();
    expect(screen.getByText("Confianza")).toBeInTheDocument();
    expect(screen.getByText("Gestión responsable")).toBeInTheDocument();
    expect(screen.getByText("Bienestar")).toBeInTheDocument();
    expect(screen.getByText("Compromiso familiar")).toBeInTheDocument();
  });

  it("positions all three stats at distinct locations (no overlapping duplicate position)", () => {
    mockPrefersReducedMotion(false);
    renderHomePage();

    const stat1 = screen.getByText("Cercanía").closest("div")!;
    const stat2 = screen.getByText("Confianza").closest("div")!;
    const stat3 = screen.getByText("Bienestar").closest("div")!;

    const classLists = [stat1, stat2, stat3].map((el) => el.className);
    expect(new Set(classLists).size).toBe(3);
  });

  it("keeps the placeholder hero image decorative (empty alt) - no imageAlt wired in yet", () => {
    mockPrefersReducedMotion(false);
    renderHomePage();
    // Hero and About each render their own decorative placeholder image,
    // so both must resolve to role "presentation" with an empty alt.
    const images = screen.getAllByRole("presentation");
    expect(images.length).toBeGreaterThanOrEqual(1);
    images.forEach((image) => expect(image).toHaveAttribute("alt", ""));
  });

  it("renders the heading fully visible immediately when reduced motion is preferred", () => {
    mockPrefersReducedMotion(true);
    renderHomePage();

    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1).toBeVisible();
    expect(h1.style.opacity === "" || h1.style.opacity === "1").toBe(true);
  });
});

describe("HomePage - TrustBar and About sections (US-013)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders exactly one page-level h1 even with the About section's h2 present", () => {
    mockPrefersReducedMotion(false);
    renderHomePage();

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 2, name: "Quiénes somos" })).toBeInTheDocument();
  });

  it("renders no TrustBar content, since no approved trust-item copy exists yet", () => {
    mockPrefersReducedMotion(false);
    renderHomePage();
    expect(screen.queryByRole("region", { name: "Indicadores de confianza" })).not.toBeInTheDocument();
  });

  it("anchors the About section at #quienes-somos, reachable via the homepage anchor", () => {
    mockPrefersReducedMotion(false);
    const { container } = renderHomePage();
    expect(container.querySelector("section#quienes-somos")).toBeInTheDocument();
  });

  it("renders the three approved About card titles with no invented body copy", () => {
    mockPrefersReducedMotion(false);
    renderHomePage();

    for (const title of ["Nuestra historia", "Nuestra misión", "Nuestra visión"]) {
      const heading = screen.getByRole("heading", { level: 3, name: title });
      expect(heading.closest("article")?.querySelector("p")).not.toBeInTheDocument();
    }
  });

  it("renders Hero before the About section in document order", () => {
    mockPrefersReducedMotion(false);
    renderHomePage();

    const h1 = screen.getByRole("heading", { level: 1 });
    const about = document.querySelector("section#quienes-somos")!;
    expect(h1.compareDocumentPosition(about) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
