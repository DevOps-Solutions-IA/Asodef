import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import { GuidedStartPage } from "./GuidedStartPage";

function renderPage(path = "/comenzar") {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><MemoryRouter initialEntries={[path]}><GuidedStartPage/></MemoryRouter></QueryClientProvider>);
}

describe("GuidedStartPage", () => {
  beforeEach(() => sessionStorage.clear());
  it("hands payment support to the real specialized flow without collecting a lead", () => {
    renderPage(); fireEvent.click(screen.getByRole("radio", { name: /pago necesito consultar/i })); fireEvent.click(screen.getByRole("button", { name: /continuar/i }));
    expect(screen.getByRole("link", { name: /ir al centro de pagos/i })).toHaveAttribute("href", "/pagos");
    expect(screen.queryByLabelText(/nombre completo/i)).not.toBeInTheDocument();
  });
  it("branches company visitors into organization-specific, recoverable questions", () => {
    renderPage("/comenzar?perfil=empresa&utm_source=campana");
    expect(screen.getByRole("heading", { name: /qué necesitas resolver/i })).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText(/conocer una categoría/i), { target: { value: "Ruta para colaboradores" } });
    fireEvent.click(screen.getByRole("button", { name: /continuar/i }));
    expect(screen.getByLabelText("Empresa")).toBeInTheDocument();
    expect(sessionStorage.getItem("asodef:guided-funnel:v1")).toContain("Ruta para colaboradores");
  });
});
