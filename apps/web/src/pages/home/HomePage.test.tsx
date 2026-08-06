import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { HomePage } from "./HomePage";

describe("flagship homepage",()=>{
  it("leads with concrete actions and linked service nodes",()=>{
    render(<MemoryRouter><HomePage/></MemoryRouter>);
    expect(screen.getByRole("heading",{level:1})).toHaveTextContent(/beneficios, pagos y solicitudes/i);
    expect(screen.getAllByRole("link",{name:/recibir orientación/i})[0]).toHaveAttribute("href","/comenzar");
    const ecosystem = screen.getByRole("navigation", { name: "Accesos directos ASODEF" });
    expect(within(ecosystem).getByRole("link", { name: /personas/i })).toHaveAttribute("href", "/soluciones/personas");
    expect(within(ecosystem).getByRole("link", { name: /pagos/i })).toHaveAttribute("href", "/pagos");
  });
  it("offers only the five transactional mobile quick actions as real links", () => {
    render(<MemoryRouter><HomePage/></MemoryRouter>);
    const actions = screen.getByLabelText("Acciones rápidas", { selector: "nav" });
    expect(within(actions).getByRole("list")).toHaveClass("grid", "grid-cols-2");
    expect(within(actions).getAllByRole("link")).toHaveLength(5);
    expect(within(actions).queryByRole("link", { name: /consultar beneficios|recibir orientación/i })).not.toBeInTheDocument();
    expect(within(actions).getByRole("link", { name: /^pagar$/i })).toHaveAttribute("href", "/pagos");
    expect(within(actions).getByRole("link", { name: /^pagar$/i })).toHaveClass("bg-brand-dark");
    expect(within(actions).getByRole("link", { name: /^pagar$/i }).closest("li")).toHaveClass("col-span-2");
    expect(within(actions).getByRole("link", { name: /radicar pqr/i })).toHaveAttribute("href", "/pqr?accion=radicar");
    expect(within(actions).getByRole("link", { name: /consultar caso/i })).toHaveAttribute("href", "/pqr?accion=consultar");
    expect(within(actions).getByRole("link", { name: /solicitudes de datos/i })).toHaveAttribute("href", "/solicitudes-de-datos");
    expect(within(actions).getByRole("link", { name: /ingresar/i })).toHaveAttribute("href", "/iniciar-sesion");
  });
  it("uses one sourced temporal figure and two qualitative indicators",()=>{
    render(<MemoryRouter><HomePage/></MemoryRouter>);
    expect(screen.getByText("años como ASODEF S.A.S.")).toBeInTheDocument();
    expect(screen.getByText("Cali, Colombia")).toBeInTheDocument();
    expect(screen.getByText("S.A.S.")).toBeInTheDocument();
    expect(screen.queryByText("categorías de beneficios")).not.toBeInTheDocument();
    expect(screen.queryByText("documentos institucionales publicados")).not.toBeInTheDocument();
    expect(screen.queryByText("gestiones públicas")).not.toBeInTheDocument();
    expect(screen.queryByText("8.405")).not.toBeInTheDocument();
    expect(screen.queryByText("54.692")).not.toBeInTheDocument();
  });
  it("hides the audience chip on mobile and balances the two hero actions",()=>{
    render(<MemoryRouter><HomePage/></MemoryRouter>);
    expect(screen.getByText(/Personas · afiliados · empresas · aliados/)).toHaveClass("hidden");
    const primary=screen.getAllByRole("link",{name:/recibir orientación/i})[0];
    expect(primary).toBeDefined();
    expect(primary?.parentElement).toHaveClass("min-[390px]:grid-cols-2");
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
