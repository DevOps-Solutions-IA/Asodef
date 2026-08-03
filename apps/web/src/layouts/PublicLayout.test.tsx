import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { PublicLayout } from "./PublicLayout";

function renderPublicLayout() {
  const router = createMemoryRouter(
    [{ path: "/", element: <PublicLayout />, children: [{ index: true, element: <div>Contenido de la página</div> }] }],
    { initialEntries: ["/"] },
  );
  return render(<RouterProvider router={router} />);
}

describe("PublicLayout", () => {
  it("renders the footer's navigation links (US-018)", () => {
    renderPublicLayout();
    const footerNav = within(screen.getByRole("navigation", { name: "Pie de página" }));
    for (const label of ["Quiénes somos", "Beneficios", "Portafolio", "Cobertura", "Pagos", "Contacto"]) {
      expect(footerNav.getByRole("link", { name: label })).toBeInTheDocument();
    }
  });

  it("renders the approved footer contact info verbatim", () => {
    renderPublicLayout();
    expect(screen.getByText("Juan Pablo Filigrana, Director Comercial")).toBeInTheDocument();
    expect(screen.getByText("WhatsApp 323 273 3927")).toBeInTheDocument();
    expect(screen.getByText("Cali, Colombia")).toBeInTheDocument();
  });

  it("renders legal placeholder links pointing to real, existing routes", () => {
    renderPublicLayout();
    expect(screen.getByRole("link", { name: "Centro legal" })).toHaveAttribute("href", "/legal");
    expect(screen.getByRole("link", { name: "Términos y condiciones" })).toHaveAttribute(
      "href",
      "/legal/terminos-y-condiciones",
    );
    expect(screen.getByRole("link", { name: "Política de privacidad" })).toHaveAttribute(
      "href",
      "/legal/politica-de-privacidad",
    );
    expect(screen.getByRole("link", { name: "Política de cookies" })).toHaveAttribute(
      "href",
      "/legal/politica-de-cookies",
    );
  });

  it("renders the dynamic copyright year", () => {
    renderPublicLayout();
    expect(screen.getByText(new RegExp(`© ${new Date().getFullYear()}`))).toBeInTheDocument();
  });

  it("renders the floating WhatsApp button site-wide, not homepage-only", () => {
    renderPublicLayout();
    const link = screen.getByRole("link", { name: "Contactar por WhatsApp (se abre en una pestaña nueva)" });
    expect(link).toHaveAttribute("href", "https://wa.me/573232733927");
  });
});
