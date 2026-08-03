import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TrustBar } from "./TrustBar";

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

describe("TrustBar", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders nothing when no items are supplied - never invents trust content", () => {
    mockPrefersReducedMotion(false);
    const { container } = render(<TrustBar />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when given an empty items array", () => {
    mockPrefersReducedMotion(false);
    const { container } = render(<TrustBar items={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders each supplied item's label and sublabel verbatim", () => {
    mockPrefersReducedMotion(false);
    render(
      <TrustBar
        items={[
          { label: "Item uno", sublabel: "Detalle uno" },
          { label: "Item dos" },
        ]}
      />,
    );

    expect(screen.getByText("Item uno")).toBeInTheDocument();
    expect(screen.getByText("Detalle uno")).toBeInTheDocument();
    expect(screen.getByText("Item dos")).toBeInTheDocument();
  });

  it("renders at most 4 items even when more are supplied", () => {
    mockPrefersReducedMotion(false);
    render(
      <TrustBar
        items={[
          { label: "Uno" },
          { label: "Dos" },
          { label: "Tres" },
          { label: "Cuatro" },
          { label: "Cinco" },
        ]}
      />,
    );

    expect(screen.getByText("Uno")).toBeInTheDocument();
    expect(screen.getByText("Cuatro")).toBeInTheDocument();
    expect(screen.queryByText("Cinco")).not.toBeInTheDocument();
  });

  it("labels the region for assistive tech without inventing a heading", () => {
    mockPrefersReducedMotion(false);
    render(<TrustBar items={[{ label: "Uno" }]} />);
    expect(screen.getByRole("region", { name: "Indicadores de confianza" })).toBeInTheDocument();
  });

  it("renders items fully visible immediately when reduced motion is preferred", () => {
    mockPrefersReducedMotion(true);
    render(<TrustBar items={[{ label: "Item de prueba" }]} />);

    const label = screen.getByText("Item de prueba");
    expect(label).toBeVisible();
    expect(label.closest("div")?.style.opacity === "" || label.closest("div")?.style.opacity === "1").toBe(true);
  });
});
