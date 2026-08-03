import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
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

    // Scoped to the Hero section: "Gestión responsable" and "Compromiso
    // familiar" are also approved copy elsewhere (a CompanyBenefits card
    // title and a TrustBar item title, respectively - US-015/US-013).
    const hero = within(screen.getByText("Cercanía").closest("section")!);
    expect(hero.getByText("Cercanía")).toBeInTheDocument();
    expect(hero.getByText("Atención humana")).toBeInTheDocument();
    expect(hero.getByText("Confianza")).toBeInTheDocument();
    expect(hero.getByText("Gestión responsable")).toBeInTheDocument();
    expect(hero.getByText("Bienestar")).toBeInTheDocument();
    expect(hero.getByText("Compromiso familiar")).toBeInTheDocument();
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

    // Scoped to the TrustBar region: "Atención cercana" and "Compromiso
    // familiar" are also approved copy elsewhere (CompanyBenefits card
    // title and a Hero stat label, respectively - US-015).
    const trustBar = within(screen.getByRole("region", { name: "Indicadores de confianza" }));
    expect(trustBar.getByText("Atención cercana")).toBeInTheDocument();
    expect(trustBar.getByText("Acompañamiento humano y responsable")).toBeInTheDocument();
    expect(trustBar.getByText("Gestión confiable")).toBeInTheDocument();
    expect(trustBar.getByText("Procesos claros y orientados al bienestar")).toBeInTheDocument();
    expect(trustBar.getByText("Compromiso familiar")).toBeInTheDocument();
    expect(trustBar.getByText("Soluciones pensadas para las familias")).toBeInTheDocument();
    expect(trustBar.getByText("Servicio responsable")).toBeInTheDocument();
    expect(trustBar.getByText("Atención con respeto, transparencia y cuidado")).toBeInTheDocument();
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

    // "Atención cercana" is approved copy in both the TrustBar item and a
    // CompanyBenefits card title (US-015) - disambiguate by container tag.
    const trustItem = screen.getAllByText("Atención cercana").find((el) => el.closest("div") && !el.closest("article"))!;
    const aboutCard = screen.getByText("Nuestra historia").closest("article")!;
    expect(trustItem.closest("div")!.style.opacity === "" || trustItem.closest("div")!.style.opacity === "1").toBe(true);
    expect(aboutCard.style.opacity === "" || aboutCard.style.opacity === "1").toBe(true);
  });
});

describe("HomePage - approved CompanyBenefits and BenefitPortfolio copy (US-015)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders exactly one page-level h1 with Benefits/Portfolio headings present", () => {
    mockPrefersReducedMotion(false);
    renderHomePage();

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 2, name: "Soluciones que aportan bienestar y valor" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Alternativas pensadas para cada necesidad" })).toBeInTheDocument();
  });

  it("anchors CompanyBenefits at #beneficios and BenefitPortfolio at #portafolio", () => {
    mockPrefersReducedMotion(false);
    const { container } = renderHomePage();
    expect(container.querySelector("section#beneficios")).toBeInTheDocument();
    expect(container.querySelector("section#portafolio")).toBeInTheDocument();
  });

  it("renders all six approved Company Benefits cards with their bodies", () => {
    mockPrefersReducedMotion(false);
    const { container } = renderHomePage();
    const benefits = within(container.querySelector("section#beneficios")!);

    for (const title of [
      "Atención cercana",
      "Soluciones flexibles",
      "Bienestar familiar",
      "Gestión responsable",
      "Acompañamiento continuo",
      "Relaciones de confianza",
    ]) {
      expect(benefits.getByRole("heading", { level: 3, name: title })).toBeInTheDocument();
    }
    expect(
      benefits.getByText("Brindamos orientación clara y acompañamiento humano durante cada etapa del servicio."),
    ).toBeInTheDocument();
    expect(
      benefits.getByText("Construimos vínculos basados en el cumplimiento, la comunicación y el respeto mutuo."),
    ).toBeInTheDocument();
  });

  it("renders all eight approved Benefit Portfolio categories with unique 'Conocer más' links", () => {
    mockPrefersReducedMotion(false);
    const { container } = renderHomePage();
    const portfolio = within(container.querySelector("section#portafolio")!);

    const categories = [
      "Bienestar personal",
      "Bienestar familiar",
      "Educación y desarrollo",
      "Hogar y protección",
      "Recreación y experiencias",
      "Orientación y acompañamiento",
      "Soluciones para empresas",
      "Servicios complementarios",
    ];

    for (const title of categories) {
      expect(portfolio.getByRole("heading", { level: 3, name: title })).toBeInTheDocument();
      const link = portfolio.getByRole("link", { name: `Conocer más sobre ${title}` });
      expect(link).toHaveAttribute("href", "/#contacto");
    }
  });

  it("renders no lorem/placeholder text anywhere on the homepage", () => {
    mockPrefersReducedMotion(false);
    const { container } = renderHomePage();
    expect(container.textContent).not.toMatch(/lorem ipsum/i);
  });

  it("renders Hero, TrustBar, About, CompanyBenefits, and BenefitPortfolio in document order", () => {
    mockPrefersReducedMotion(false);
    renderHomePage();

    const h1 = screen.getByRole("heading", { level: 1 });
    const trustBar = screen.getByRole("region", { name: "Indicadores de confianza" });
    const about = document.querySelector("section#quienes-somos")!;
    const benefits = document.querySelector("section#beneficios")!;
    const portfolio = document.querySelector("section#portafolio")!;

    expect(h1.compareDocumentPosition(trustBar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(trustBar.compareDocumentPosition(about) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(about.compareDocumentPosition(benefits) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(benefits.compareDocumentPosition(portfolio) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("HomePage - approved Coverage and Alliance CTA copy (US-016)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders exactly one page-level h1 with Coverage/Alliance headings present", () => {
    mockPrefersReducedMotion(false);
    renderHomePage();

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 2, name: "Desde Cali, trabajamos cerca de ti" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Conviértete en aliado de ASODEF" })).toBeInTheDocument();
  });

  it("anchors Coverage at #cobertura and Alliance CTA at #aliados", () => {
    mockPrefersReducedMotion(false);
    const { container } = renderHomePage();
    expect(container.querySelector("section#cobertura")).toBeInTheDocument();
    expect(container.querySelector("section#aliados")).toBeInTheDocument();
  });

  it("renders all three approved Coverage cards, with Cali stated in visible text", () => {
    mockPrefersReducedMotion(false);
    const { container } = renderHomePage();
    const coverage = within(container.querySelector("section#cobertura")!);

    expect(coverage.getByRole("heading", { level: 3, name: "Sede principal" })).toBeInTheDocument();
    expect(coverage.getByRole("heading", { level: 3, name: "Acompañamiento institucional" })).toBeInTheDocument();
    expect(coverage.getByText(/sede principal se encuentra en Cali/i)).toBeInTheDocument();

    for (const otherCity of ["Bogotá", "Medellín", "Barranquilla"]) {
      expect(coverage.queryByText(otherCity)).not.toBeInTheDocument();
    }
  });

  it("renders the Alliance CTA's primary and WhatsApp actions with the approved copy", () => {
    mockPrefersReducedMotion(false);
    renderHomePage();

    expect(screen.getByRole("link", { name: "Quiero ser aliado" })).toHaveAttribute("href", "/#contacto");

    const whatsappLink = screen.getByRole("link", { name: /Hablar por WhatsApp/ });
    expect(whatsappLink).toHaveAttribute(
      "href",
      "https://wa.me/573232733927?text=" + encodeURIComponent("Hola, quiero conocer más información para ser aliado de ASODEF."),
    );
    expect(whatsappLink).toHaveAttribute("target", "_blank");
    expect(whatsappLink).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("renders no lorem/placeholder text anywhere on the homepage", () => {
    mockPrefersReducedMotion(false);
    const { container } = renderHomePage();
    expect(container.textContent).not.toMatch(/lorem ipsum/i);
  });

  it("renders every homepage section in the correct document order", () => {
    mockPrefersReducedMotion(false);
    renderHomePage();

    const h1 = screen.getByRole("heading", { level: 1 });
    const trustBar = screen.getByRole("region", { name: "Indicadores de confianza" });
    const about = document.querySelector("section#quienes-somos")!;
    const benefits = document.querySelector("section#beneficios")!;
    const portfolio = document.querySelector("section#portafolio")!;
    const coverage = document.querySelector("section#cobertura")!;
    const alliance = document.querySelector("section#aliados")!;

    expect(h1.compareDocumentPosition(trustBar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(trustBar.compareDocumentPosition(about) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(about.compareDocumentPosition(benefits) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(benefits.compareDocumentPosition(portfolio) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(portfolio.compareDocumentPosition(coverage) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(coverage.compareDocumentPosition(alliance) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("renders Coverage and Alliance content fully visible immediately under reduced motion", () => {
    mockPrefersReducedMotion(true);
    renderHomePage();

    const coverageCard = screen.getByText("Sede principal").closest("article")!;
    const allianceHeading = screen.getByRole("heading", { level: 2, name: "Conviértete en aliado de ASODEF" });
    const allianceContainer = allianceHeading.closest("div")!.parentElement!;

    expect(coverageCard.style.opacity === "" || coverageCard.style.opacity === "1").toBe(true);
    expect(allianceContainer.style.opacity === "" || allianceContainer.style.opacity === "1").toBe(true);
  });
});
