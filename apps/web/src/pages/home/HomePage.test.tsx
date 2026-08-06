import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { HomePage } from "./HomePage";

describe("flagship homepage",()=>{
  it("leads with concrete actions and linked service nodes",()=>{
    render(<MemoryRouter><HomePage/></MemoryRouter>);
    expect(screen.getByRole("heading",{level:1})).toHaveTextContent(/beneficios y gestiones/i);
    expect(screen.getAllByRole("link",{name:/recibir orientación/i})[0]).toHaveAttribute("href","/comenzar");
    const ecosystem = screen.getByRole("navigation", { name: "Accesos directos ASODEF" });
    expect(within(ecosystem).getByRole("link", { name: /personas/i })).toHaveAttribute("href", "/soluciones/personas");
    expect(within(ecosystem).getByRole("link", { name: /pagos/i })).toHaveAttribute("href", "/pagos");
  });
  it("offers the six required mobile quick actions as real links", () => {
    render(<MemoryRouter><HomePage/></MemoryRouter>);
    const actions = screen.getByRole("navigation", { name: "Accesos rápidos" });
    expect(within(actions).getAllByRole("link")).toHaveLength(6);
    expect(within(actions).getByRole("link", { name: /consultar beneficios/i })).toHaveAttribute("href", "/beneficios");
    expect(within(actions).getByRole("link", { name: /^pagar$/i })).toHaveAttribute("href", "/pagos");
    expect(within(actions).getByRole("link", { name: /radicar solicitud/i })).toHaveAttribute("href", "/solicitudes-de-datos");
    expect(within(actions).getByRole("link", { name: /consultar caso/i })).toHaveAttribute("href", "/pqr?accion=consultar");
  });
  it("uses only sourced institutional metrics",()=>{
    render(<MemoryRouter><HomePage/></MemoryRouter>);
    expect(screen.getByText("categorías de beneficios")).toBeInTheDocument();
    expect(screen.getByText("documentos institucionales publicados")).toBeInTheDocument();
    expect(screen.getByText("gestiones públicas")).toBeInTheDocument();
    expect(screen.queryByText("8.405")).not.toBeInTheDocument();
    expect(screen.queryByText("54.692")).not.toBeInTheDocument();
  });
  it("presents all audience paths and a substantive benefit preview",()=>{
    render(<MemoryRouter><HomePage/></MemoryRouter>);
    for(const audience of ["Personas y familias","Afiliados y usuarios","Empresas","Potenciales aliados"])expect(screen.getByRole("heading",{name:audience})).toBeInTheDocument();
    const portfolio=screen.getByRole("heading",{name:"Consulta el portafolio por necesidad"}).closest("section");expect(portfolio).not.toBeNull();expect(within(portfolio!).getAllByRole("link").length).toBeGreaterThanOrEqual(6);
  });
  it("contains no generic legacy claims or fake testimonial content",()=>{
    render(<MemoryRouter><HomePage/></MemoryRouter>);
    expect(document.body).not.toHaveTextContent(/información para decidir con claridad|contenido verificable|experiencia verificable|gestión correcta|ruta clara|soluciones integrales|servicios de calidad|líder del mercado|testimonio/i);
  });
});
