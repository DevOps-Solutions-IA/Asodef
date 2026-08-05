import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatisticsSection } from "./StatisticsSection";

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

describe("StatisticsSection", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders nothing when no heading and no stats are supplied - never invents statistics", () => {
    mockPrefersReducedMotion(false);
    const { container } = render(<StatisticsSection />);
    expect(container).toBeEmptyDOMElement();
  });

  it("labels the region for assistive tech using the supplied heading", () => {
    mockPrefersReducedMotion(false);
    render(<StatisticsSection heading="ASODEF en cifras" numericStats={[{ value: 8405, label: "Titulares afiliados" }]} />);
    expect(screen.getByRole("heading", { name: "ASODEF en cifras" })).toBeInTheDocument();
  });

  it("renders every numeric stat's label", () => {
    mockPrefersReducedMotion(false);
    render(
      <StatisticsSection
        heading="ASODEF en cifras"
        numericStats={[
          { value: 8405, label: "Titulares afiliados" },
          { value: 54692, label: "Beneficiarios" },
        ]}
      />,
    );
    expect(screen.getByText("Titulares afiliados")).toBeInTheDocument();
    expect(screen.getByText("Beneficiarios")).toBeInTheDocument();
  });

  it("renders every labeled (non-numeric) stat's value and label verbatim", () => {
    mockPrefersReducedMotion(false);
    render(
      <StatisticsSection
        heading="ASODEF en cifras"
        labeledStats={[
          { value: "Más de 20 años", label: "Experiencia" },
          { value: "Cobertura nacional", label: "Alcance" },
          { value: "Red de convenios", label: "Alianzas" },
        ]}
      />,
    );
    expect(screen.getByText("Más de 20 años")).toBeInTheDocument();
    expect(screen.getByText("Cobertura nacional")).toBeInTheDocument();
    expect(screen.getByText("Red de convenios")).toBeInTheDocument();
  });

  it("Negative case (AC, verbatim): with reduced motion enabled, the final numbers render immediately without an intermediate counting animation", () => {
    mockPrefersReducedMotion(true);
    render(
      <StatisticsSection
        heading="ASODEF en cifras"
        numericStats={[
          { value: 8405, label: "Titulares afiliados" },
          { value: 54692, label: "Beneficiarios" },
        ]}
      />,
    );

    // No intermediate frame to wait for - the exact final formatted
    // value must already be present on the very first render.
    expect(screen.getByText("8.405")).toBeInTheDocument();
    expect(screen.getByText("54.692")).toBeInTheDocument();
  });

  it("without reduced motion, the counter starts at 0 until the section is actually observed as in-viewport (jsdom has no real IntersectionObserver, so it never fires here - real scroll-triggered counting is verified in a real browser, not this unit test)", () => {
    mockPrefersReducedMotion(false);
    render(<StatisticsSection heading="ASODEF en cifras" numericStats={[{ value: 8405, label: "Titulares afiliados" }]} />);

    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.queryByText("8.405")).not.toBeInTheDocument();
  });

  it("does not render a heading element when no heading is supplied, even with stats present", () => {
    mockPrefersReducedMotion(false);
    render(<StatisticsSection numericStats={[{ value: 8405, label: "Titulares afiliados" }]} />);
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(screen.getByText("Titulares afiliados")).toBeInTheDocument();
  });
});
