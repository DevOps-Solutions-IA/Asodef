import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { BenefitDetailPage } from "./BenefitDetailPage";

describe("BenefitDetailPage", () => {
  it("renders decision-making detail and visible FAQ for a verified benefit", () => {
    render(<MemoryRouter initialEntries={["/beneficios/movilidad"]}><Routes><Route path="/beneficios/:slug" element={<BenefitDetailPage/>}/></Routes></MemoryRouter>);
    expect(screen.getByRole("heading", { level: 1, name: "Movilidad" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Cómo avanzar" })).toBeInTheDocument();
    expect(screen.getByText(/cada alternativa puede tener condiciones propias/i)).toBeInTheDocument();
  });

  it("places the guided primary action before the portfolio action", () => {
    render(<MemoryRouter initialEntries={["/beneficios/movilidad"]}><Routes><Route path="/beneficios/:slug" element={<BenefitDetailPage/>}/></Routes></MemoryRouter>);
    const primary = screen.getAllByRole("link", { name: "Encontrar mi ruta" })[0]!;
    const secondary = screen.getByRole("link", { name: "Volver al portafolio" });
    expect(primary).toHaveAttribute("href", "/comenzar?beneficio=movilidad");
    expect(secondary).toHaveAttribute("href", "/beneficios");
    expect(primary.compareDocumentPosition(secondary) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("stacks at the base viewport and balances content from 390px", () => {
    render(<MemoryRouter initialEntries={["/beneficios/movilidad"]}><Routes><Route path="/beneficios/:slug" element={<BenefitDetailPage/>}/></Routes></MemoryRouter>);
    const needCard = screen.getByRole("heading", { name: "El problema que aborda" }).closest("article");
    expect(needCard?.parentElement).toHaveClass("grid", "min-[390px]:grid-cols-2");
    const process = screen.getByRole("heading", { name: "Cómo avanzar" }).parentElement?.querySelector("ol");
    expect(process).toHaveClass("grid", "min-[390px]:grid-cols-2", "lg:grid-cols-3");
    expect(process?.lastElementChild).toHaveClass("min-[390px]:last:col-span-2", "lg:last:col-span-1");
  });

  it("uses specific legal-link labels and uniform touch targets", () => {
    render(<MemoryRouter initialEntries={["/beneficios/movilidad"]}><Routes><Route path="/beneficios/:slug" element={<BenefitDetailPage/>}/></Routes></MemoryRouter>);
    const terms = screen.getByRole("link", { name: "Términos y condiciones" });
    expect(terms).toHaveAttribute("href", "/legal/terminos-y-condiciones");
    expect(terms).toHaveClass("min-h-12");
    expect(screen.queryByRole("link", { name: "Documento legal relacionado" })).not.toBeInTheDocument();
  });

  it("publishes the sourced Plan Preferencial facts and #523 without inventing eligibility", () => {
    render(<MemoryRouter initialEntries={["/beneficios/plan-exequial-familiar"]}><Routes><Route path="/beneficios/:slug" element={<BenefitDetailPage/>}/></Routes></MemoryRouter>);
    expect(screen.getByRole("heading", { name: "Plan preferencial para mayor acompañamiento familiar" })).toBeInTheDocument();
    expect(screen.getAllByText(/Sala VIP: comodidad y privacidad/i)).not.toHaveLength(0);
    expect(screen.getAllByText(/Dos buses: transporte para acompañantes/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/hasta \$3\.000\.000 sin costo adicional, sujeto/i).length).toBeGreaterThan(0);
    expect(screen.getByText("ATENCIÓN RÁPIDA")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Marca #523 gratis desde tu celular/i })).toHaveAttribute("href", "tel:%23523");
    expect(screen.getAllByRole("link", { name: "Consultar mi plan" })[0]).toHaveAttribute("href", "/mi-cuenta/acceso");
    expect(screen.getByRole("link", { name: "Solicitar orientación" })).toHaveAttribute("href", "/comenzar?beneficio=plan-exequial-familiar");
    expect(document.body).not.toHaveTextContent(/incluido automáticamente|cobertura garantizada/i);
  });
});
