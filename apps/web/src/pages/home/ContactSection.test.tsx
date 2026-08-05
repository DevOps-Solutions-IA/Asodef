import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { createQueryClient } from "../../lib/query-client";
import { ContactSection } from "./ContactSection";

function jsonResponse(status: number, body: unknown): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}

/** Required-field labels render with a trailing "*" (see packages/ui's
 * Label component), so exact text matching fails - same pattern already
 * used by ResetPasswordPage.test.tsx. */
function field(label: string): HTMLElement {
  return screen.getByLabelText(label, { exact: false, selector: "input, textarea" });
}

function renderContactSection() {
  const queryClient = createQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ContactSection eyebrow="Hablemos" heading="Contáctanos" description="Cuéntanos en qué podemos ayudarte." />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(field("Nombre completo"), "Visitante de Prueba");
  await user.type(field("Empresa"), "Empresa de Prueba S.A.S.");
  await user.type(field("Cargo"), "Gerente Comercial");
  await user.type(field("Ciudad"), "Cali");
  await user.type(field("Teléfono / WhatsApp"), "3001234567");
  await user.type(field("Correo electrónico"), "visitante@example.com");
  await user.type(field("Sector"), "Servicios");
  await user.type(field("Mensaje"), "Quiero conocer más sobre ASODEF.");
  await user.click(screen.getByRole("checkbox"));
}

describe("ContactSection", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders nothing when no heading is supplied - never invents institutional copy", () => {
    const queryClient = createQueryClient();
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ContactSection />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("anchors the section at #contacto", () => {
    const { container } = renderContactSection();
    expect(container.querySelector("section#contacto")).toBeInTheDocument();
  });

  it("renders the heading as an h2, never a page-level h1", () => {
    renderContactSection();
    expect(screen.getByRole("heading", { level: 2, name: "Contáctanos" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
  });

  it("renders all required fields plus the consent checkbox", () => {
    renderContactSection();
    for (const label of ["Nombre completo", "Empresa", "Cargo", "Ciudad", "Teléfono / WhatsApp", "Correo electrónico", "Sector", "Mensaje"]) {
      expect(field(label)).toBeInTheDocument();
    }
    expect(screen.getByRole("checkbox")).toBeInTheDocument();
    const consentLink = screen.getByRole("link", { name: /tratamiento de mis datos personales/ });
    expect(consentLink).toHaveAttribute("href", "/legal/tratamiento-de-datos");
    // US-045 AC: opens in a new tab, so filling out the form isn't lost.
    expect(consentLink).toHaveAttribute("target", "_blank");
  });

  it("shows inline validation errors when submitted empty, without calling the API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderContactSection();

    await user.click(screen.getByRole("button", { name: "Enviar mensaje" }));

    expect(await screen.findByText("El nombre completo es requerido.")).toBeInTheDocument();
    expect(screen.getByText("Debes aceptar el tratamiento de datos para continuar.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("Negative case (AC): does not submit when every other field is valid but consentAccepted is false", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderContactSection();

    // Fill every field except the consent checkbox - isolates that
    // this one validation rule alone blocks submission, not merely
    // "the whole form was empty".
    await user.type(field("Nombre completo"), "Visitante de Prueba");
    await user.type(field("Empresa"), "Empresa de Prueba S.A.S.");
    await user.type(field("Cargo"), "Gerente Comercial");
    await user.type(field("Ciudad"), "Cali");
    await user.type(field("Teléfono / WhatsApp"), "3001234567");
    await user.type(field("Correo electrónico"), "visitante@example.com");
    await user.type(field("Sector"), "Servicios");
    await user.type(field("Mensaje"), "Quiero conocer más sobre ASODEF.");
    expect(screen.getByRole("checkbox")).not.toBeChecked();

    await user.click(screen.getByRole("button", { name: "Enviar mensaje" }));

    expect(await screen.findByText("Debes aceptar el tratamiento de datos para continuar.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows an inline error for an invalid email format", async () => {
    const user = userEvent.setup();
    renderContactSection();

    await user.type(field("Correo electrónico"), "not-an-email");
    await user.click(screen.getByRole("button", { name: "Enviar mensaje" }));

    expect(await screen.findByText("Ingresa un correo electrónico válido.")).toBeInTheDocument();
  });

  it("submits to POST /api/v1/leads, clears the form, and shows a Spanish success message", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, _init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/leads")) {
        return jsonResponse(201, {
          nombreCompleto: "Visitante de Prueba",
          empresa: "Empresa de Prueba S.A.S.",
          cargo: "Gerente Comercial",
          ciudad: "Cali",
          telefono: "3001234567",
          correo: "visitante@example.com",
          sector: "Servicios",
          mensaje: "Quiero conocer más sobre ASODEF.",
          consentAccepted: true,
          createdAt: "2026-08-03T00:00:00.000Z",
        });
      }
      return jsonResponse(200, {});
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    renderContactSection();
    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: "Enviar mensaje" }));

    expect(await screen.findByText("¡Gracias! Hemos recibido tu mensaje y te contactaremos pronto.")).toBeInTheDocument();

    const postCall = fetchMock.mock.calls.find(([input]) => (typeof input === "string" ? input : input.toString()).includes("/leads"));
    expect(postCall).toBeDefined();
    const requestBody = JSON.parse((postCall![1] as RequestInit).body as string);
    expect(requestBody).toMatchObject({
      nombreCompleto: "Visitante de Prueba",
      correo: "visitante@example.com",
      consentAccepted: true,
    });

    await waitFor(() => {
      expect(field("Nombre completo")).toHaveValue("");
    });
  });

  it("shows a Spanish error message and preserves entered field values on a server failure", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/leads")) {
        return jsonResponse(500, { statusCode: 500, error: "Internal Server Error", message: "boom" });
      }
      return jsonResponse(200, {});
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    renderContactSection();
    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: "Enviar mensaje" }));

    expect(await screen.findByText("Ocurrió un problema en el servidor. Intenta nuevamente más tarde.")).toBeInTheDocument();
    expect(field("Nombre completo")).toHaveValue("Visitante de Prueba");
    expect(field("Correo electrónico")).toHaveValue("visitante@example.com");
  });

  it("shows a Spanish network error message and preserves entered field values on a network failure", async () => {
    const fetchMock = vi.fn(() => Promise.reject(new TypeError("Failed to fetch")));
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    renderContactSection();
    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: "Enviar mensaje" }));

    expect(await screen.findByText("No pudimos conectar con el servidor. Verifica tu conexión a internet.")).toBeInTheDocument();
    expect(field("Nombre completo")).toHaveValue("Visitante de Prueba");
  });

  it("includes a visually-hidden honeypot field never exposed to assistive tech", () => {
    const { container } = renderContactSection();
    const honeypotWrapper = container.querySelector('[aria-hidden="true"] input[type="text"]');
    expect(honeypotWrapper).toBeInTheDocument();
    expect(honeypotWrapper).toHaveAttribute("tabindex", "-1");
  });
});
