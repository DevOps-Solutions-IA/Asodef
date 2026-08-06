import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { ContactPage } from "./ContactPage";

function jsonResponse(status: number, body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}

function renderPage(fetchMock = vi.fn(() => jsonResponse(200, { version: 2 }))) {
  vi.stubGlobal("fetch", fetchMock);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter><ContactPage /></MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ContactPage", () => {
  it("routes specialized needs to their real workflows without showing a general form", () => {
    renderPage();

    expect(screen.getByRole("link", { name: /Conocer beneficios/ })).toHaveAttribute("href", "/beneficios");
    expect(screen.getByRole("link", { name: /Consultar un pago/ })).toHaveAttribute("href", "/pagos");
    expect(screen.getByRole("link", { name: /Radicar una PQR/ })).toHaveAttribute("href", "/pqr?accion=radicar");
    expect(screen.getByRole("link", { name: /Ejercer un derecho/ })).toHaveAttribute("href", "/solicitudes-de-datos?accion=crear");
    expect(screen.getByRole("link", { name: /Gestionar una empresa/ })).toHaveAttribute("href", "/comenzar?perfil=empresa");
    expect(screen.queryByRole("button", { name: "Enviar mensaje" })).not.toBeInTheDocument();
  });

  it("reveals the real general contact form only for another matter", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: /Otro asunto/ }));

    expect(screen.getByRole("heading", { name: "Registra un mensaje para orientación" })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Enviar mensaje" })).toBeInTheDocument();
    expect(document.getElementById("otro-asunto")).toHaveFocus();
  });

  it("submits a minimized real CRM lead with required versioned consents", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, _init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/leads/guided")) return jsonResponse(201, { reference: "ASO-CONTACT-001", status: "received", createdAt: "2026-08-06T12:00:00.000Z" });
      return jsonResponse(200, { version: 2 });
    });
    const user = userEvent.setup();
    renderPage(fetchMock);

    await user.click(screen.getByRole("button", { name: /Otro asunto/ }));
    await user.type(screen.getByLabelText("Nombre completo", { exact: false }), "Persona de Prueba");
    await user.type(screen.getByRole("textbox", { name: /^Correo electrónico/ }), "persona@example.com");
    await user.type(screen.getByRole("textbox", { name: /^Mensaje/ }), "Necesito orientación sobre una gestión diferente.");
    await user.click(screen.getByRole("checkbox", { name: /tratamiento necesario/ }));
    await user.click(screen.getByRole("checkbox", { name: /recibir la respuesta por correo/ }));
    await user.click(screen.getByRole("button", { name: "Enviar mensaje" }));

    expect(await screen.findByRole("heading", { name: "Mensaje registrado" })).toBeInTheDocument();
    expect(screen.getByText("ASO-CONTACT-001")).toBeInTheDocument();
    const leadCall = fetchMock.mock.calls.find(([input]) => (typeof input === "string" ? input : input.toString()).includes("/leads/guided"));
    expect(leadCall).toBeDefined();
    const payload = JSON.parse(leadCall?.[1]?.body as string) as Record<string, unknown>;
    expect(payload).toMatchObject({ audience: "orientation", need: "Otro asunto", preferredContact: "email", dataProcessingConsent: true, emailConsent: true });
    expect(payload).not.toHaveProperty("company");
    expect(payload).not.toHaveProperty("position");
    expect(payload).not.toHaveProperty("sector");
  });
});
