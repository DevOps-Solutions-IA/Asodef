import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AboutSection } from "./AboutSection";

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

describe("AboutSection", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders nothing when neither heading nor cards are supplied - never invents institutional copy", () => {
    mockPrefersReducedMotion(false);
    const { container } = render(<AboutSection />);
    expect(container).toBeEmptyDOMElement();
  });

  it("anchors the section at #quienes-somos", () => {
    mockPrefersReducedMotion(false);
    const { container } = render(<AboutSection heading="Quiénes somos" />);
    expect(container.querySelector("section#quienes-somos")).toBeInTheDocument();
  });

  it("renders the heading as an h2, never a page-level h1", () => {
    mockPrefersReducedMotion(false);
    render(<AboutSection heading="Quiénes somos" />);

    expect(screen.getByRole("heading", { level: 2, name: "Quiénes somos" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
  });

  it("labels the section landmark with the heading's own accessible name", () => {
    mockPrefersReducedMotion(false);
    render(<AboutSection heading="Quiénes somos" />);
    expect(screen.getByRole("region", { name: "Quiénes somos" })).toBeInTheDocument();
  });

  it("renders card titles verbatim and omits body copy when not supplied - never invents card content", () => {
    mockPrefersReducedMotion(false);
    render(<AboutSection cards={[{ title: "Nuestra historia" }, { title: "Nuestra misión" }]} />);

    const historia = screen.getByText("Nuestra historia");
    expect(historia.tagName).toBe("H3");
    expect(historia.closest("article")).toHaveTextContent("Nuestra historia");
    expect(historia.closest("article")?.querySelector("p")).not.toBeInTheDocument();

    expect(screen.getByText("Nuestra misión")).toBeInTheDocument();
  });

  it("renders a card's body only when explicitly supplied", () => {
    mockPrefersReducedMotion(false);
    render(<AboutSection cards={[{ title: "Nuestra visión", body: "Copy de prueba." }]} />);
    expect(screen.getByText("Copy de prueba.")).toBeInTheDocument();
  });

  it("renders at most 3 cards even when more are supplied", () => {
    mockPrefersReducedMotion(false);
    render(
      <AboutSection
        cards={[{ title: "Uno" }, { title: "Dos" }, { title: "Tres" }, { title: "Cuatro" }]}
      />,
    );

    expect(screen.getByText("Uno")).toBeInTheDocument();
    expect(screen.getByText("Tres")).toBeInTheDocument();
    expect(screen.queryByText("Cuatro")).not.toBeInTheDocument();
  });

  it("keeps the placeholder about image decorative (empty alt)", () => {
    mockPrefersReducedMotion(false);
    render(<AboutSection heading="Quiénes somos" />);
    const image = screen.getByRole("presentation");
    expect(image.tagName).toBe("IMG");
    expect(image).toHaveAttribute("alt", "");
  });

  it("renders cards fully visible immediately when reduced motion is preferred", () => {
    mockPrefersReducedMotion(true);
    render(<AboutSection cards={[{ title: "Nuestra historia" }]} />);

    const card = screen.getByText("Nuestra historia").closest("article")!;
    expect(card).toBeVisible();
    expect(card.style.opacity === "" || card.style.opacity === "1").toBe(true);
  });
});
