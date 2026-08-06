import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { AudiencePage, SolutionsPage } from "./SolutionsPage";

describe("public solutions", () => {
  it("lists the four distinct audience journeys", () => {
    render(<MemoryRouter><SolutionsPage /></MemoryRouter>);
    for (const label of ["Personas y familias", "Afiliados y usuarios", "Empresas", "Potenciales aliados"]) expect(screen.getByRole("heading", { name: label })).toBeInTheDocument();
  });
  it("connects companies to real portal and guided routes", () => {
    render(<MemoryRouter initialEntries={["/soluciones/empresas"]}><Routes><Route path="/soluciones/:audience" element={<AudiencePage/>}/></Routes></MemoryRouter>);
    expect(screen.getByRole("link", { name: /portal empresarial/i })).toHaveAttribute("href", "/empresa");
    expect(screen.getByRole("link", { name: /iniciar recorrido/i })).toHaveAttribute("href", "/comenzar?perfil=empresa");
  });
  it("describes allies as an evaluated interest, never as an automatic program", () => {
    render(<MemoryRouter initialEntries={["/soluciones/aliados"]}><Routes><Route path="/soluciones/:audience" element={<AudiencePage/>}/></Routes></MemoryRouter>);
    expect(screen.getByText(/no se afirma la existencia de un programa automático/i)).toBeInTheDocument();
    expect(screen.getByText(/postulación no constituye contrato/i)).toBeInTheDocument();
  });
});
