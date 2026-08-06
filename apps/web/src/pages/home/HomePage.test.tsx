import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { HomePage } from "./HomePage";

describe("flagship homepage",()=>{
  it("leads with the guided flow and a real ecosystem representation",()=>{
    render(<MemoryRouter><HomePage/></MemoryRouter>);
    expect(screen.getByRole("heading",{level:1})).toHaveTextContent(/una ruta clara/i);
    expect(screen.getAllByRole("link",{name:/encontrar mi ruta/i})[0]).toHaveAttribute("href","/comenzar");
    expect(screen.getByLabelText("Ecosistema digital ASODEF")).toBeInTheDocument();
  });
  it("uses only sourced institutional metrics",()=>{
    render(<MemoryRouter><HomePage/></MemoryRouter>);
    expect(screen.getByText("8.405")).toBeInTheDocument();expect(screen.getByText("54.692")).toBeInTheDocument();expect(screen.getByText("21")).toBeInTheDocument();
  });
  it("presents all audience paths and a substantive benefit preview",()=>{
    render(<MemoryRouter><HomePage/></MemoryRouter>);
    for(const audience of ["Personas y familias","Afiliados y usuarios","Empresas","Potenciales aliados"])expect(screen.getByRole("heading",{name:audience})).toBeInTheDocument();
    const portfolio=screen.getByRole("heading",{name:"Beneficios organizados para decidir"}).closest("section");expect(portfolio).not.toBeNull();expect(within(portfolio!).getAllByRole("link").length).toBeGreaterThanOrEqual(6);
  });
  it("contains no generic legacy claims or fake testimonial content",()=>{
    render(<MemoryRouter><HomePage/></MemoryRouter>);
    expect(document.body).not.toHaveTextContent(/soluciones integrales|servicios de calidad|líder del mercado|testimonio/i);
  });
});
