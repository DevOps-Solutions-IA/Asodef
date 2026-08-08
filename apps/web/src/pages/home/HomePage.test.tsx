import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { HomePage } from "./HomePage";

describe("flagship homepage",()=>{
  it("leads with a corporate message and restrained service signals",()=>{
    render(<MemoryRouter><HomePage/></MemoryRouter>);
    expect(screen.getByRole("heading",{level:1})).toHaveTextContent(/bienestar, respaldo y atención/i);
    expect(screen.getAllByRole("link",{name:/mi cuenta/i})[0]).toHaveAttribute("href","/mi-cuenta/acceso");
    expect(screen.getByRole("link",{name:/conocer beneficios/i})).toHaveAttribute("href","/beneficios");
    expect(screen.getByRole("heading", { name: /cada gestión tiene un acceso claro/i })).toBeInTheDocument();
    expect(screen.queryByText("Servicios conectados")).not.toBeInTheDocument();
    const accessPanel = screen.getByRole("heading", { name: /cada gestión tiene un acceso claro/i }).closest<HTMLDivElement>("div.relative");
    expect(accessPanel).not.toBeNull();
    for (const [label, path] of [["Afiliados", "/mi-cuenta/acceso"], ["Empresas", "/empresa/acceso"], ["Pagos", "/pagos"], ["Solicitudes", "/recursos"]]) {
      expect(within(accessPanel!).getByRole("link", { name: label })).toHaveAttribute("href", path);
    }
  });
  it("offers only Pagar and Mi cuenta in the mobile quick-action block", () => {
    render(<MemoryRouter><HomePage/></MemoryRouter>);
    const actions = screen.getByLabelText("Acciones rápidas", { selector: "nav" });
    expect(within(actions).getByRole("list")).toHaveClass("grid", "gap-3");
    expect(within(actions).getAllByRole("link")).toHaveLength(2);
    expect(within(actions).queryByRole("link", { name: /consultar beneficios|recibir orientación|radicar pqr|consultar caso|solicitudes de datos/i })).not.toBeInTheDocument();
    expect(within(actions).getByRole("link", { name: /^pagar$/i })).toHaveAttribute("href", "/pagos");
    expect(within(actions).getByRole("link", { name: /^pagar$/i })).toHaveClass("bg-brand-dark");
    expect(within(actions).getByRole("link", { name: /mi cuenta/i })).toHaveAttribute("href", "/mi-cuenta/acceso");
  });
  it("presents the verified trajectory as one breathable two-by-two institutional panel",()=>{
    render(<MemoryRouter><HomePage/></MemoryRouter>);
    expect(screen.getByRole("heading", { name: /más de una década construyendo relaciones de confianza/i })).toBeInTheDocument();
    expect(screen.getByText("de trayectoria institucional")).toBeInTheDocument();
    expect(screen.getByText("2012")).toBeInTheDocument();
    expect(screen.getByText("Cali, Colombia")).toBeInTheDocument();
    expect(screen.getByText("S.A.S.")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Información institucional verificada" })).toHaveClass("grid-cols-2");
    expect(screen.queryByText("categorías de beneficios")).not.toBeInTheDocument();
    expect(screen.queryByText("documentos institucionales publicados")).not.toBeInTheDocument();
    expect(screen.queryByText("gestiones públicas")).not.toBeInTheDocument();
    expect(screen.queryByText("8.405")).not.toBeInTheDocument();
    expect(screen.queryByText("54.692")).not.toBeInTheDocument();
  });
  it("removes the old audience chip and keeps desktop hero actions out of the mobile action block",()=>{
    render(<MemoryRouter><HomePage/></MemoryRouter>);
    expect(screen.queryByText(/Personas · afiliados · empresas · aliados/)).not.toBeInTheDocument();
    const primary=screen.getAllByRole("link",{name:/mi cuenta/i})[0];
    expect(primary?.parentElement).toHaveClass("hidden", "sm:flex");
  });
  it("presents all audience paths and a substantive benefit preview",()=>{
    render(<MemoryRouter><HomePage/></MemoryRouter>);
    for(const audience of ["Personas y familias","Afiliados y titulares","Empresas","Potenciales aliados"])expect(screen.getByRole("heading",{name:audience})).toBeInTheDocument();
    const portfolio=screen.getByRole("heading",{name:"Consulta el portafolio por necesidad"}).closest("section");expect(portfolio).not.toBeNull();expect(within(portfolio!).getAllByRole("link").length).toBeGreaterThanOrEqual(6);
  });
  it("contains no generic legacy claims or fake testimonial content",()=>{
    render(<MemoryRouter><HomePage/></MemoryRouter>);
    expect(document.body).not.toHaveTextContent(/información para decidir con claridad|contenido verificable|experiencia verificable|gestión correcta|ruta clara|soluciones integrales|servicios de calidad|líder del mercado|testimonio/i);
  });
});
