import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
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
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/encuentra opciones/i);
    expect(screen.getAllByRole("link", { name: /ver condiciones y proceso/i })).toHaveLength(8);
    expect(document.body).not.toHaveTextContent(/información para decidir con claridad|contenido verificable|ruta clara/i);
  });
});
