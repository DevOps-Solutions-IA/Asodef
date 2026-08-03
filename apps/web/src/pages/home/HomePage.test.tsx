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
    // "Compromiso familiar" is approved copy in both the Hero stat label
    // and the TrustBar's third item title - two distinct, legitimate uses.
    expect(screen.getAllByText("Compromiso familiar")).toHaveLength(2);
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

describe("HomePage - approved TrustBar and About copy (US-013)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders exactly one page-level h1 even with the About section's h2 present", () => {
    mockPrefersReducedMotion(false);
    renderHomePage();

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 2, name: "Quiénes somos" })).toBeInTheDocument();
  });

  it("renders all four approved TrustBar items with their titles and descriptions", () => {
    mockPrefersReducedMotion(false);
    renderHomePage();

    expect(screen.getByRole("region", { name: "Indicadores de confianza" })).toBeInTheDocument();
    expect(screen.getByText("Atención cercana")).toBeInTheDocument();
    expect(screen.getByText("Acompañamiento humano y responsable")).toBeInTheDocument();
    expect(screen.getByText("Gestión confiable")).toBeInTheDocument();
    expect(screen.getByText("Procesos claros y orientados al bienestar")).toBeInTheDocument();
    // "Compromiso familiar" is shared with a Hero stat label - assert both instances exist.
    expect(screen.getAllByText("Compromiso familiar")).toHaveLength(2);
    expect(screen.getByText("Soluciones pensadas para las familias")).toBeInTheDocument();
    expect(screen.getByText("Servicio responsable")).toBeInTheDocument();
    expect(screen.getByText("Atención con respeto, transparencia y cuidado")).toBeInTheDocument();
  });

  it("renders the approved About eyebrow, heading, and introductory paragraph", () => {
    mockPrefersReducedMotion(false);
    renderHomePage();

    expect(screen.getByText("Conoce a ASODEF")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Quiénes somos" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "Somos una asociación comprometida con el bienestar y el desarrollo de las familias. Trabajamos con cercanía, responsabilidad y vocación de servicio, acompañando a personas y organizaciones mediante soluciones orientadas a sus necesidades.",
      ),
    ).toBeInTheDocument();
  });

  it("anchors the About section at #quienes-somos, reachable via the homepage anchor", () => {
    mockPrefersReducedMotion(false);
    const { container } = renderHomePage();
    expect(container.querySelector("section#quienes-somos")).toBeInTheDocument();
  });

  it("renders all three complete approved About cards with their titles and body copy", () => {
    mockPrefersReducedMotion(false);
    renderHomePage();

    expect(screen.getByRole("heading", { level: 3, name: "Nuestra historia" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "ASODEF nace con el propósito de acompañar a las familias y contribuir a su bienestar mediante una gestión cercana, humana y responsable.",
      ),
    ).toBeInTheDocument();

    expect(screen.getByRole("heading", { level: 3, name: "Nuestra misión" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "Brindar atención y soluciones que aporten al bienestar de las personas, las familias y las organizaciones, actuando con compromiso, respeto y transparencia.",
      ),
    ).toBeInTheDocument();

    expect(screen.getByRole("heading", { level: 3, name: "Nuestra visión" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "Ser una organización reconocida por su cercanía, confianza y capacidad de generar valor para las familias y las comunidades que acompaña.",
      ),
    ).toBeInTheDocument();
  });

  it("renders Hero before TrustBar before the About section in document order", () => {
    mockPrefersReducedMotion(false);
    renderHomePage();

    const h1 = screen.getByRole("heading", { level: 1 });
    const trustBar = screen.getByRole("region", { name: "Indicadores de confianza" });
    const about = document.querySelector("section#quienes-somos")!;

    expect(h1.compareDocumentPosition(trustBar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(trustBar.compareDocumentPosition(about) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("renders TrustBar and About content fully visible immediately under reduced motion", () => {
    mockPrefersReducedMotion(true);
    renderHomePage();

    const trustItem = screen.getByText("Atención cercana").closest("div")!;
    const aboutCard = screen.getByText("Nuestra historia").closest("article")!;
    expect(trustItem.style.opacity === "" || trustItem.style.opacity === "1").toBe(true);
    expect(aboutCard.style.opacity === "" || aboutCard.style.opacity === "1").toBe(true);
  });
});
