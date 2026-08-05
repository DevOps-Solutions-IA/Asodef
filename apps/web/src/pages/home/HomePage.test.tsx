import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { createQueryClient } from "../../lib/query-client";
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
  const queryClient = createQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    </QueryClientProvider>,
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
        "En ASODEF creemos que proteger a las familias va más allá de ofrecer un servicio; significa crear oportunidades, generar tranquilidad y construir alianzas que mejoren la calidad de vida de miles de personas.",
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
        "ASODEF S.A.S. es una organización con más de 20 años de trayectoria, cuyos orígenes se remontan al Fondo de Empleados de Emssanar. En el año 2012 evolucionó a ASODEF S.A.S., fortaleciendo su modelo de atención y ampliando su cobertura a nivel nacional. Hoy trabajamos desde nuestra sede principal en Cali, con presencia en todo el país, ofreciendo soluciones de protección familiar, bienestar y una red de convenios estratégicos que generan beneficios reales para nuestros afiliados.",
      ),
    ).toBeInTheDocument();

    expect(screen.getByRole("heading", { level: 3, name: "Nuestra misión" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "Brindar bienestar, protección y beneficios a las familias colombianas mediante soluciones integrales, planes de protección y una sólida red de convenios con empresas aliadas, generando ahorro, confianza y tranquilidad con un servicio humano y de calidad.",
      ),
    ).toBeInTheDocument();

    expect(screen.getByRole("heading", { level: 3, name: "Nuestra visión" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "Ser la red de beneficios familiares más reconocida de Colombia, consolidando alianzas estratégicas que generen valor para nuestros afiliados y para las empresas que confían en ASODEF como un aliado para su crecimiento.",
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
    expect(screen.getByRole("heading", { level: 2, name: "¿Por qué hacer una alianza con ASODEF?" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Nuestro portafolio de beneficios" })).toBeInTheDocument();
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
      "Mayor visibilidad",
      "Nuevos clientes",
      "Difusión permanente",
      "Alianza estratégica",
      "Mayor fidelización",
      "Posicionamiento de marca",
    ]) {
      expect(benefits.getByRole("heading", { level: 3, name: title })).toBeInTheDocument();
    }
    expect(
      benefits.getByText("Promocionamos su empresa entre nuestros afiliados mediante campañas digitales y comunicación directa."),
    ).toBeInTheDocument();
    expect(
      benefits.getByText("Su empresa fortalece su reconocimiento al asociarse con una organización con más de 20 años de trayectoria."),
    ).toBeInTheDocument();
  });

  it("renders all eight approved Benefit Portfolio categories with unique 'Conocer más' links", () => {
    mockPrefersReducedMotion(false);
    const { container } = renderHomePage();
    const portfolio = within(container.querySelector("section#portafolio")!);

    const categories = [
      "Plan Exequial Familiar",
      "Seguro de Vida",
      "Asesoría Jurídica",
      "Movilidad",
      "Salud y Bienestar",
      "Educación",
      "Convenios Comerciales",
      "Nuevos Convenios",
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
    expect(screen.getByRole("heading", { level: 2, name: "Cobertura nacional" })).toBeInTheDocument();
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
    expect(coverage.getByText(/Cali es nuestra sede principal/i)).toBeInTheDocument();

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

describe("HomePage - Contact section (US-018)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders exactly one page-level h1 with the Contact section's h2 present", () => {
    mockPrefersReducedMotion(false);
    renderHomePage();

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 2, name: "Contáctanos" })).toBeInTheDocument();
  });

  it("anchors the Contact section at #contacto, resolving Hero's and AllianceCta's existing CTA hrefs", () => {
    mockPrefersReducedMotion(false);
    const { container } = renderHomePage();
    expect(container.querySelector("section#contacto")).toBeInTheDocument();

    // Both CTAs already pointed at #contacto in earlier stories (US-012,
    // US-016) before any real target existed - confirm they now resolve
    // to this real section, not a dead anchor.
    expect(screen.getByRole("link", { name: "Contáctanos" })).toHaveAttribute("href", "/#contacto");
    expect(screen.getByRole("link", { name: "Quiero ser aliado" })).toHaveAttribute("href", "/#contacto");
  });

  it("renders the Contact form with all required fields", () => {
    mockPrefersReducedMotion(false);
    renderHomePage();
    for (const label of ["Nombre completo", "Empresa", "Cargo", "Ciudad", "Correo electrónico", "Sector", "Mensaje"]) {
      expect(screen.getByLabelText(label, { exact: false, selector: "input, textarea" })).toBeInTheDocument();
    }
  });

  it("renders every homepage section, ending with Contact, in the correct document order", () => {
    mockPrefersReducedMotion(false);
    renderHomePage();

    const alliance = document.querySelector("section#aliados")!;
    const contact = document.querySelector("section#contacto")!;
    expect(alliance.compareDocumentPosition(contact) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("renders no lorem/placeholder text anywhere on the homepage", () => {
    mockPrefersReducedMotion(false);
    const { container } = renderHomePage();
    expect(container.textContent).not.toMatch(/lorem ipsum/i);
  });
});

describe("HomePage - content-hydrated hero.eyebrow (US-020)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the hardcoded fallback eyebrow immediately, before the content API resolves", () => {
    mockPrefersReducedMotion(false);
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    renderHomePage();
    expect(screen.getByText("ASODEF · Asociación para el desarrollo familiar")).toBeInTheDocument();
  });

  it("swaps in the DB-published hero.eyebrow value once the content API resolves", async () => {
    mockPrefersReducedMotion(false);
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/content")) {
          return Promise.resolve(
            new Response(JSON.stringify([{ key: "hero.eyebrow", value: "Valor publicado desde la base de datos" }]), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }),
          );
        }
        return Promise.resolve(new Response(JSON.stringify({}), { status: 200, headers: { "Content-Type": "application/json" } }));
      }),
    );

    renderHomePage();

    expect(await screen.findByText("Valor publicado desde la base de datos")).toBeInTheDocument();
    expect(screen.queryByText("ASODEF · Asociación para el desarrollo familiar")).not.toBeInTheDocument();
  });

  it("keeps the fallback eyebrow (no blank section) when the content API is unreachable", async () => {
    mockPrefersReducedMotion(false);
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))));

    renderHomePage();

    await waitFor(() => {
      expect(screen.getByText("ASODEF · Asociación para el desarrollo familiar")).toBeInTheDocument();
    });
  });
});
