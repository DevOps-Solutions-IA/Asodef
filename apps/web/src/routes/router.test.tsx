import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { routeConfig, routerFutureConfig } from "./router";

function renderAtPath(path: string) {
  const testRouter = createMemoryRouter(routeConfig, { initialEntries: [path], future: routerFutureConfig });
  return render(<RouterProvider router={testRouter} future={{ v7_startTransition: true }} />);
}

describe("router", () => {
  it("renders PublicLayout's nav and footer for the home route", () => {
    renderAtPath("/");

    expect(screen.getByRole("navigation", { name: "Principal" })).toBeInTheDocument();
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Inicio" })).toBeInTheDocument();
  });

  it("renders each top-level public marketing route inside PublicLayout", () => {
    renderAtPath("/quienes-somos");
    expect(screen.getByRole("heading", { name: "Quiénes somos" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Principal" })).toBeInTheDocument();
  });

  it("renders AuthLayout (no marketing nav/footer) for /iniciar-sesion", () => {
    renderAtPath("/iniciar-sesion");

    expect(screen.getByRole("heading", { name: "Iniciar sesión" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Principal" })).not.toBeInTheDocument();
    expect(screen.queryByRole("contentinfo")).not.toBeInTheDocument();
  });

  it("renders the lazily-loaded AccountLayout with its own nav for a nested /mi-cuenta/* route", async () => {
    renderAtPath("/mi-cuenta/perfil");

    expect(await screen.findByRole("heading", { name: "Perfil" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Cuenta" })).toBeInTheDocument();
    // and the sibling nav item to the active one is also present, proving
    // it's the full AccountLayout shell, not just the bare page
    expect(screen.getByRole("link", { name: "Documentos" })).toBeInTheDocument();
  });

  it("renders the lazily-loaded AdminLayout with its distinct nav for /admin", async () => {
    renderAtPath("/admin");

    expect(await screen.findByRole("heading", { name: "Dashboard administrativo" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Administración" })).toBeInTheDocument();
  });

  it("renders the lazily-loaded LegalLayout with its document list for /legal/politica-de-privacidad", async () => {
    renderAtPath("/legal/politica-de-privacidad");

    expect(await screen.findByRole("heading", { name: "Política de privacidad" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Documentos legales" })).toBeInTheDocument();
  });

  it("redirects /pqr to /legal/pqr", async () => {
    renderAtPath("/pqr");
    expect(await screen.findByRole("heading", { name: "PQR" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Documentos legales" })).toBeInTheDocument();
  });

  it("renders the 404 page (inside PublicLayout) for any unmatched path", () => {
    renderAtPath("/esta-ruta-no-existe");

    expect(screen.getByText("Página no encontrada")).toBeInTheDocument();
    // still within the public site chrome, not a bare unstyled fallback
    expect(screen.getByRole("navigation", { name: "Principal" })).toBeInTheDocument();
  });

  it("does not match the catch-all for a route that belongs to a different layout group", async () => {
    // regression guard: PublicLayout's "*" child must not shadow more
    // specific routes defined in later top-level route groups
    renderAtPath("/empresa/dashboard");
    expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("Página no encontrada")).not.toBeInTheDocument());
  });
});
