import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { AudiencePage, SolutionsPage } from "./SolutionsPage";

describe("public solutions", () => {
  it("lists the four distinct audience journeys", () => {
    render(<MemoryRouter><SolutionsPage /></MemoryRouter>);
    for (const label of ["Personas y familias", "Afiliados y titulares", "Empresas", "Potenciales aliados"]) expect(screen.getByRole("heading", { name: label })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/elige cómo te relacionas/i);
    expect(document.body).not.toHaveTextContent(/información para decidir con claridad|contenido verificable|experiencia verificable/i);
  });
  it("connects companies to NIT access and orientation", () => {
    render(<MemoryRouter initialEntries={["/soluciones/empresas"]}><Routes><Route path="/soluciones/:audience" element={<AudiencePage/>}/></Routes></MemoryRouter>);
    expect(screen.getAllByRole("link", { name: /acceso de empresas/i })[0]).toHaveAttribute("href", "/empresa/acceso");
    expect(screen.getAllByRole("link", { name: /solicitar orientación/i })[0]).toHaveAttribute("href", "/comenzar?perfil=empresa");
    expect(screen.getAllByText(/NIT registrado/i).length).toBeGreaterThan(0);
  });
  it("sends affiliates to identifier access and describes provider-ready capabilities", () => {
    render(<MemoryRouter initialEntries={["/soluciones/afiliados"]}><Routes><Route path="/soluciones/:audience" element={<AudiencePage/>}/></Routes></MemoryRouter>);
    expect(screen.getAllByRole("link", { name: /consultar mi afiliación/i })[0]).toHaveAttribute("href", "/mi-cuenta/acceso");
    expect(screen.getAllByText(/beneficiarios y documentos/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/estado de cuenta y pagos/i).length).toBeGreaterThan(0);
  });
  it("describes allies as an evaluated interest, never as an automatic program", () => {
    render(<MemoryRouter initialEntries={["/soluciones/aliados"]}><Routes><Route path="/soluciones/:audience" element={<AudiencePage/>}/></Routes></MemoryRouter>);
    expect(screen.getByText(/no se afirma la existencia de un programa automático/i)).toBeInTheDocument();
    expect(screen.getByText(/postulación no constituye contrato/i)).toBeInTheDocument();
  });
});
