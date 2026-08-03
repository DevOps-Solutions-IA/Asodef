import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AllianceCta } from "./AllianceCta";

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

function renderCta(props: Parameters<typeof AllianceCta>[0] = {}) {
  return render(
    <MemoryRouter>
      <AllianceCta {...props} />
    </MemoryRouter>,
  );
}

const approvedProps = {
  eyebrow: "Construyamos juntos",
  heading: "Conviértete en aliado de ASODEF",
  description: "Trabajamos con organizaciones interesadas en aportar al bienestar de sus colaboradores, sus familias y sus comunidades.",
  primaryAction: { label: "Quiero ser aliado", href: "#contacto" },
  whatsapp: {
    label: "Hablar por WhatsApp",
    phoneNumber: "573232733927",
    message: "Hola, quiero conocer más información para ser aliado de ASODEF.",
  },
};

describe("AllianceCta", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders nothing when no heading is supplied - never invents institutional copy", () => {
    mockPrefersReducedMotion(false);
    const { container } = renderCta();
    expect(container).toBeEmptyDOMElement();
  });

  it("anchors the section at #aliados", () => {
    mockPrefersReducedMotion(false);
    const { container } = renderCta({ heading: "Conviértete en aliado de ASODEF" });
    expect(container.querySelector("section#aliados")).toBeInTheDocument();
  });

  it("renders the heading as an h2, never a page-level h1", () => {
    mockPrefersReducedMotion(false);
    renderCta({ heading: "Conviértete en aliado de ASODEF" });

    expect(screen.getByRole("heading", { level: 2, name: "Conviértete en aliado de ASODEF" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
  });

  it("renders the approved eyebrow and supporting copy", () => {
    mockPrefersReducedMotion(false);
    renderCta(approvedProps);

    expect(screen.getByText("Construyamos juntos")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Trabajamos con organizaciones interesadas en aportar al bienestar de sus colaboradores, sus familias y sus comunidades.",
      ),
    ).toBeInTheDocument();
  });

  it("renders the primary CTA pointing at #contacto", () => {
    mockPrefersReducedMotion(false);
    renderCta(approvedProps);

    const link = screen.getByRole("link", { name: "Quiero ser aliado" });
    expect(link).toHaveAttribute("href", "/#contacto");
  });

  it("builds the WhatsApp URL with the correct number and URL-encoded message", () => {
    mockPrefersReducedMotion(false);
    renderCta(approvedProps);

    const link = screen.getByRole("link", { name: /Hablar por WhatsApp/ });
    expect(link).toHaveAttribute(
      "href",
      "https://wa.me/573232733927?text=" + encodeURIComponent("Hola, quiero conocer más información para ser aliado de ASODEF."),
    );
  });

  it("opens the WhatsApp link in a new tab safely", () => {
    mockPrefersReducedMotion(false);
    renderCta(approvedProps);

    const link = screen.getByRole("link", { name: /Hablar por WhatsApp/ });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("gives the WhatsApp link an accessible name that discloses it opens externally", () => {
    mockPrefersReducedMotion(false);
    renderCta(approvedProps);

    const link = screen.getByRole("link", { name: /Hablar por WhatsApp.*pestaña nueva/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveTextContent("Hablar por WhatsApp");
  });

  it("does not render the WhatsApp action when no whatsapp prop is supplied", () => {
    mockPrefersReducedMotion(false);
    renderCta({ heading: "Conviértete en aliado de ASODEF" });
    expect(screen.queryByRole("link", { name: /WhatsApp/ })).not.toBeInTheDocument();
  });

  it("renders content fully visible immediately when reduced motion is preferred", () => {
    mockPrefersReducedMotion(true);
    renderCta(approvedProps);

    const container = screen.getByRole("heading", { level: 2 }).closest("div")!.parentElement!;
    expect(container).toBeVisible();
    expect(container.style.opacity === "" || container.style.opacity === "1").toBe(true);
  });
});
