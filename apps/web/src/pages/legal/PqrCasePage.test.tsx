import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { PqrCasePage } from "./PqrCasePage";

function jsonResponse(status: number, body: unknown): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}

function renderPage(fetchMock: ReturnType<typeof vi.fn>, route = "/pqr") {
  vi.stubGlobal("fetch", fetchMock);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}><PqrCasePage /></MemoryRouter>
    </QueryClientProvider>,
  );
}

async function reachReview(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Radicar una PQR" }));
  await user.click(screen.getByRole("radio", { name: /Reclamo/ }));
  await user.click(screen.getByRole("button", { name: "Continuar" }));
  await user.type(await screen.findByLabelText("Descripción del caso", { exact: false }), "No estoy de acuerdo con el cobro.");
  await user.click(screen.getByRole("button", { name: "Continuar" }));
  await user.type(await screen.findByLabelText("Nombre completo", { exact: false }), "Titular de Prueba");
  await user.type(screen.getByLabelText("Correo o teléfono de contacto", { exact: false }), "titular@example.com");
  await user.click(screen.getByRole("button", { name: "Continuar" }));
}

describe("PqrCasePage", () => {
  beforeEach(() => sessionStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("starts with two dominant tasks and no complete form", () => {
    renderPage(vi.fn(() => jsonResponse(404, {})));

    expect(screen.getByRole("button", { name: "Radicar una PQR" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Consultar un caso" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Descripción del caso")).not.toBeInTheDocument();
    expect(screen.queryByText(/Elige si quieres registrar un caso nuevo/)).not.toBeInTheDocument();
  });

  it("opens tracking when a connected route requests accion=consultar", () => {
    renderPage(vi.fn(() => jsonResponse(404, {})), "/pqr?accion=consultar");

    expect(screen.getByLabelText("Número de caso")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Consultar un caso" })).toHaveAttribute("aria-pressed", "true");
  });

  it("renders the four verified categories as an accessible selector", async () => {
    const user = userEvent.setup();
    renderPage(vi.fn(() => jsonResponse(404, {})));

    await user.click(screen.getByRole("button", { name: "Radicar una PQR" }));

    expect(screen.getAllByRole("radio")).toHaveLength(4);
    expect(screen.getByRole("radio", { name: /Petición/ })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("radio", { name: /Sugerencia/ })).toBeInTheDocument();
  });

  it("validates the current step before advancing or calling the API", async () => {
    const fetchMock = vi.fn((_input?: RequestInfo | URL, _init?: RequestInit) => jsonResponse(404, {}));
    const user = userEvent.setup();
    renderPage(fetchMock);

    await user.click(screen.getByRole("button", { name: "Radicar una PQR" }));
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    expect(await screen.findByText("Selecciona una categoría.")).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === "POST")).toBe(false);
  });

  it("submits the real payload and presents confirmation actions", async () => {
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) =>
      init?.method === "POST"
        ? jsonResponse(201, { caseNumber: "PQR-ABC123", category: "reclamo", status: "RECEIVED", description: "Caso", resolution: null, createdAt: "2026-08-01T00:00:00.000Z" })
        : jsonResponse(404, {}),
    );
    const user = userEvent.setup();
    renderPage(fetchMock);
    await reachReview(user);
    await user.click(screen.getByRole("checkbox", { name: /Acepto el tratamiento necesario/ }));
    await user.click(screen.getByRole("button", { name: "Confirmar y enviar" }));

    expect(await screen.findByText("PQR-ABC123")).toBeInTheDocument();
    expect(screen.getAllByText(/Paso 5 de 5/).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /Copiar referencia/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Consultar estado" })).toBeInTheDocument();
    const post = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === "POST");
    expect(JSON.parse(String((post?.[1] as RequestInit).body))).toMatchObject({ category: "reclamo", applicantContact: "titular@example.com" });
    await waitFor(() => expect(sessionStorage.getItem("asodef:pqr-public-flow:v1")).toBeNull());
  });

  it("copies the returned case number", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => init?.method === "POST" ? jsonResponse(201, { caseNumber: "PQR-COPY", category: "reclamo", status: "RECEIVED", description: "Caso", resolution: null, createdAt: "2026-08-01T00:00:00.000Z" }) : jsonResponse(404, {}));
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    renderPage(fetchMock);
    await reachReview(user);
    await user.click(screen.getByRole("checkbox", { name: /Acepto el tratamiento necesario/ }));
    await user.click(screen.getByRole("button", { name: "Confirmar y enviar" }));
    await user.click(await screen.findByRole("button", { name: /Copiar referencia/ }));

    expect(writeText).toHaveBeenCalledWith("PQR-COPY");
    expect(screen.getByText("Referencia copiada", { selector: "button" })).toBeVisible();
  });

  it("tracks a case but does not expose its submitted description", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      return url.includes("/pqr-cases/track-me")
        ? jsonResponse(200, { caseNumber: "track-me", category: "queja", status: "IN_REVIEW", description: "Contenido personal que no debe mostrarse", resolution: null, createdAt: "2026-08-01T00:00:00.000Z" })
        : jsonResponse(404, {});
    });
    const user = userEvent.setup();
    renderPage(fetchMock);
    await user.click(screen.getByRole("button", { name: "Consultar un caso" }));
    await user.type(screen.getByLabelText("Número de caso"), "track-me");
    await user.click(screen.getByRole("button", { name: "Consultar" }));

    expect((await screen.findAllByText("En revisión")).length).toBeGreaterThan(0);
    expect(screen.queryByText("Contenido personal que no debe mostrarse")).not.toBeInTheDocument();
    expect(screen.getByText(/no muestra datos del solicitante/)).toBeInTheDocument();
  });

  it("recovers the session draft at the last valid step", async () => {
    sessionStorage.setItem("asodef:pqr-public-flow:v1", JSON.stringify({ mode: "create", step: 2, category: "peticion", values: { category: "peticion", description: "Petición conservada", applicantName: "Nombre conservado", applicantContact: "contacto@example.com" } }));
    renderPage(vi.fn(() => jsonResponse(404, {})));

    expect(screen.getByLabelText("Nombre completo", { exact: false })).toHaveValue("Nombre conservado");
    expect(screen.getByLabelText("Correo o teléfono de contacto", { exact: false })).toHaveValue("contacto@example.com");
    expect(sessionStorage.getItem("asodef:pqr-public-flow:v1")).toContain("Petición conservada");
  });
});
