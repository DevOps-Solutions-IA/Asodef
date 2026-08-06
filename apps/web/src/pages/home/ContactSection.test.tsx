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

const PUBLISHED_POLICY_RESPONSE = {
  slug: "tratamiento-de-datos",
  type: "PRIVACY_POLICY",
  title: "Tratamiento de datos",
  version: 1,
  content: { sections: [] },
  effectiveDate: null,
  publicationDate: "2026-01-01T00:00:00.000Z",
};

/** Every test in this file renders a form that proactively checks the
 * tratamiento-de-datos publication status on mount (see ContactSection's
 * own doc comment) - this stubs that call as "published" by default so
 * tests unrelated to that gate can still exercise the form, while
 * `otherHandler` still gets a say in every other URL. */
function fetchMockWithPublishedPolicy(otherHandler: (input: RequestInfo | URL) => Promise<Response>) {
  return vi.fn((input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/legal-documents/")) {
      return jsonResponse(200, PUBLISHED_POLICY_RESPONSE);
    }
    return otherHandler(input);
  });
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
  await user.click(screen.getByRole("checkbox", { name: /tratamiento de mis datos personales/ }));
}

describe("ContactSection", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders nothing when no heading is supplied - never invents institutional copy", () => {
    vi.stubGlobal("fetch", fetchMockWithPublishedPolicy(() => Promise.reject(new Error("unexpected fetch call"))));
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
    vi.stubGlobal("fetch", fetchMockWithPublishedPolicy(() => Promise.reject(new Error("unexpected fetch call"))));
    const { container } = renderContactSection();
    expect(container.querySelector("section#contacto")).toBeInTheDocument();
  });

  it("renders the heading as an h2, never a page-level h1", () => {
    vi.stubGlobal("fetch", fetchMockWithPublishedPolicy(() => Promise.reject(new Error("unexpected fetch call"))));
    renderContactSection();
    expect(screen.getByRole("heading", { level: 2, name: "Contáctanos" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
  });

  it("renders all required fields plus the consent checkbox", () => {
    vi.stubGlobal("fetch", fetchMockWithPublishedPolicy(() => Promise.reject(new Error("unexpected fetch call"))));
    renderContactSection();
    for (const label of ["Nombre completo", "Empresa", "Cargo", "Ciudad", "Teléfono / WhatsApp", "Correo electrónico", "Sector", "Mensaje"]) {
      expect(field(label)).toBeInTheDocument();
    }
    expect(screen.getByRole("checkbox", { name: /tratamiento de mis datos personales/ })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /recibir novedades y beneficios/ })).toBeInTheDocument();
    const consentLink = screen.getByRole("link", { name: /tratamiento de mis datos personales/ });
    expect(consentLink).toHaveAttribute("href", "/legal/tratamiento-de-datos");
    // US-045 AC: opens in a new tab, so filling out the form isn't lost.
    expect(consentLink).toHaveAttribute("target", "_blank");
  });

  it("shows inline validation errors when submitted empty, without calling the API", async () => {
    const fetchMock = fetchMockWithPublishedPolicy(() => Promise.reject(new Error("unexpected fetch call")));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderContactSection();

    await user.click(screen.getByRole("button", { name: "Enviar mensaje" }));

    expect(await screen.findByText("El nombre completo es requerido.")).toBeInTheDocument();
    expect(screen.getByText("Debes aceptar el tratamiento de datos para continuar.")).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([input]) => (typeof input === "string" ? input : input.toString()).includes("/leads"))).toBe(false);
  });

  it("Negative case (AC): does not submit when every other field is valid but consentAccepted is false", async () => {
    const fetchMock = fetchMockWithPublishedPolicy(() => Promise.reject(new Error("unexpected fetch call")));
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
    expect(screen.getByRole("checkbox", { name: /tratamiento de mis datos personales/ })).not.toBeChecked();

    await user.click(screen.getByRole("button", { name: "Enviar mensaje" }));

    expect(await screen.findByText("Debes aceptar el tratamiento de datos para continuar.")).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([input]) => (typeof input === "string" ? input : input.toString()).includes("/leads"))).toBe(false);
  });

  it("shows an inline error for an invalid email format", async () => {
    vi.stubGlobal("fetch", fetchMockWithPublishedPolicy(() => Promise.reject(new Error("unexpected fetch call"))));
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
    vi.stubGlobal("fetch", fetchMockWithPublishedPolicy(() => Promise.reject(new Error("unexpected fetch call"))));
    const { container } = renderContactSection();
    const honeypotWrapper = container.querySelector('[aria-hidden="true"] input[type="text"]');
    expect(honeypotWrapper).toBeInTheDocument();
    expect(honeypotWrapper).toHaveAttribute("tabindex", "-1");
  });

  it("always renders the institutional contact channels (WhatsApp, email, office), regardless of form availability", async () => {
    vi.stubGlobal("fetch", fetchMockWithPublishedPolicy(() => Promise.reject(new Error("unexpected fetch call"))));
    renderContactSection();

    expect(screen.getByText("Juan Pablo Filigrana")).toBeInTheDocument();
    expect(screen.getByText("Director Comercial")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /WhatsApp 323 273 3927/ })).toHaveAttribute("href", "https://wa.me/573232733927");
    expect(screen.getByRole("link", { name: "info@asodef.com.co" })).toHaveAttribute("href", "mailto:info@asodef.com.co");
  });

  it("Negative case (AC): when tratamiento-de-datos remains unpublished (DRAFT), shows a controlled unavailable state instead of the form, without hiding the rest of the page", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/legal-documents/")) {
          return jsonResponse(404, { statusCode: 404, error: "Not Found", message: "No se encontraron resultados." });
        }
        return Promise.reject(new Error("unexpected fetch call"));
      }),
    );
    renderContactSection();

    expect(await screen.findByText("Formulario no disponible por ahora")).toBeInTheDocument();
    // The heading, description and contact channels still render - the
    // page is never left blank just because the form itself is gated.
    expect(screen.getByRole("heading", { level: 2, name: "Contáctanos" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /WhatsApp 323 273 3927/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Enviar mensaje" })).not.toBeInTheDocument();
  });
});
