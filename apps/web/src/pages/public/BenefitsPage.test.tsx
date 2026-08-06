import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { BenefitsPage } from "./BenefitsPage";

describe("BenefitsPage", () => {
  it("filters the sourced registry by audience and need", () => {
    render(<MemoryRouter><BenefitsPage /></MemoryRouter>);
    expect(screen.getByText("8 categorías encontradas")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Necesidad"), { target: { value: "educacion" } });
    expect(screen.getByText("1 categoría encontrada")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Educación" })).toBeInTheDocument();
  });

  it("uses concrete decision copy instead of institutional filler", () => {
    render(<MemoryRouter><BenefitsPage /></MemoryRouter>);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/encuentra una opción/i);
    expect(screen.getAllByRole("link", { name: /ver condiciones y proceso/i })).toHaveLength(8);
    expect(document.body).not.toHaveTextContent(/información para decidir con claridad|contenido verificable|ruta clara/i);
  });

  it("keeps filters keyboard-native, touch-sized and persisted in the URL", () => {
    function LocationProbe() {
      const location = useLocation();
      return <output aria-label="Ubicación actual">{`${location.pathname}${location.search}`}</output>;
    }

    render(<MemoryRouter initialEntries={["/beneficios?origen=prueba"]}><BenefitsPage /><LocationProbe /></MemoryRouter>);
    const profile = screen.getByLabelText("Perfil");
    const need = screen.getByLabelText("Necesidad");
    expect(profile.tagName).toBe("SELECT");
    expect(profile).toHaveClass("min-h-12");
    expect(need).toHaveClass("min-h-12");
    fireEvent.change(profile, { target: { value: "afiliados" } });
    expect(screen.getByLabelText("Ubicación actual")).toHaveTextContent("/beneficios?origen=prueba&audiencia=afiliados");
  });

  it("uses a compact result count and mobile card density", () => {
    render(<MemoryRouter><BenefitsPage /></MemoryRouter>);
    const count = screen.getByText("8 categorías encontradas");
    expect(count).toHaveClass("inline-flex", "min-h-8");
    const firstCard = screen.getByRole("heading", { name: "Plan exequial familiar" }).closest("article");
    expect(firstCard).toHaveClass("p-5", "md:min-h-[19rem]");
  });
});
