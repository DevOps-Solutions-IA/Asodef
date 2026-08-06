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
});
