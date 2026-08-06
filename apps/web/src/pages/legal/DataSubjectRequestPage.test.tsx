import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { DataSubjectRequestPage } from "./DataSubjectRequestPage";

function jsonResponse(status: number, body: unknown): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}

function renderPage(fetchMock: ReturnType<typeof vi.fn>, route = "/solicitudes-de-datos") {
  vi.stubGlobal("fetch", fetchMock);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}><DataSubjectRequestPage /></MemoryRouter>
    </QueryClientProvider>,
  );
}

async function reachReview(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Crear solicitud" }));
  await user.click(screen.getByRole("radio", { name: /Eliminación/ }));
  await user.click(screen.getByRole("button", { name: "Continuar" }));
  await user.type(await screen.findByLabelText("Descripción de la solicitud", { exact: false }), "Quiero eliminar mis datos.");
  await user.click(screen.getByRole("button", { name: "Continuar" }));
  await user.type(await screen.findByLabelText("Nombre completo", { exact: false }), "Titular de Prueba");
  await user.type(screen.getByLabelText("Número de documento", { exact: false }), "1000000099");
  await user.type(screen.getByLabelText("Correo electrónico", { exact: false }), "titular@example.com");
  await user.click(screen.getByRole("button", { name: "Continuar" }));
}

describe("DataSubjectRequestPage", () => {
  beforeEach(() => sessionStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("starts with two tasks and no full form", () => {
    renderPage(vi.fn(() => jsonResponse(404, {})));

    expect(screen.getByRole("button", { name: "Crear solicitud" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Consultar referencia" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Descripción de la solicitud")).not.toBeInTheDocument();
  });

  it("opens creation when a connected route requests accion=crear", () => {
    renderPage(vi.fn(() => jsonResponse(404, {})), "/solicitudes-de-datos?accion=crear");

    expect(screen.getByRole("radiogroup", { name: "Tipo de solicitud" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Crear solicitud" })).toHaveAttribute("aria-pressed", "true");
  });

  it("renders all eleven request types as an accessible selector", async () => {
    const user = userEvent.setup();
    renderPage(vi.fn(() => jsonResponse(404, {})));
    await user.click(screen.getByRole("button", { name: "Crear solicitud" }));

    expect(screen.getAllByRole("radio")).toHaveLength(11);
    expect(screen.getByRole("radio", { name: /Acceso a mis datos/ })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Reporte de incidente/ })).toBeInTheDocument();
  });

  it("validates the current step before advancing", async () => {
    const fetchMock = vi.fn();
    const user = userEvent.setup();
    renderPage(fetchMock);
    await user.click(screen.getByRole("button", { name: "Crear solicitud" }));
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    expect(await screen.findByText("Selecciona el tipo de solicitud.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("submits a real deletion request and shows its reference", async () => {
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => init?.method === "POST" ? jsonResponse(201, { publicReference: "DSR-ABC123", type: "DELETION", status: "RECEIVED", description: "Solicitud", resolution: null, createdAt: "2026-08-01T00:00:00.000Z" }) : jsonResponse(404, {}));
    const user = userEvent.setup();
    renderPage(fetchMock);
    await reachReview(user);
    await user.click(screen.getByRole("checkbox", { name: /Acepto el tratamiento de mis datos/ }));
    await user.click(screen.getByRole("button", { name: "Confirmar y enviar" }));

    expect(await screen.findByText("DSR-ABC123")).toBeInTheDocument();
    expect(screen.getAllByText(/Paso 5 de 5/).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /Copiar referencia/ })).toBeInTheDocument();
    const post = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === "POST");
    expect(JSON.parse(String((post?.[1] as RequestInit).body))).toMatchObject({ type: "DELETION", requesterDocument: "1000000099" });
    await waitFor(() => expect(sessionStorage.getItem("asodef:data-request-public-flow:v1")).toBeNull());
  });

  it("tracks a request without exposing identity or submitted description", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => String(input).includes("/data-subject-requests/track-me") ? jsonResponse(200, { publicReference: "track-me", type: "ACCESS", status: "IN_REVIEW", description: "Contenido personal", resolution: null, createdAt: "2026-08-01T00:00:00.000Z" }) : jsonResponse(404, {}));
    const user = userEvent.setup();
    renderPage(fetchMock);
    await user.click(screen.getByRole("button", { name: "Consultar referencia" }));
    await user.type(screen.getByLabelText("Referencia de seguimiento"), "track-me");
    await user.click(screen.getByRole("button", { name: "Consultar" }));

    expect((await screen.findAllByText("En revisión")).length).toBeGreaterThan(0);
    expect(screen.queryByText("Contenido personal")).not.toBeInTheDocument();
    expect(screen.getByText(/no muestra el documento/)).toBeInTheDocument();
  });

  it("shows a clear error for an unknown reference", async () => {
    const user = userEvent.setup();
    renderPage(vi.fn(() => jsonResponse(404, {})));
    await user.click(screen.getByRole("button", { name: "Consultar referencia" }));
    await user.type(screen.getByLabelText("Referencia de seguimiento"), "no-existe");
    await user.click(screen.getByRole("button", { name: "Consultar" }));

    expect(await screen.findByText(/No encontramos una solicitud/)).toBeInTheDocument();
  });

  it("recovers the session draft at the last valid step", () => {
    sessionStorage.setItem("asodef:data-request-public-flow:v1", JSON.stringify({ mode: "create", step: 2, type: "ACCESS", values: { type: "ACCESS", description: "Consulta conservada", requesterName: "Nombre conservado", requesterEmail: "titular@example.com", requesterDocument: "1000000099" } }));
    renderPage(vi.fn(() => jsonResponse(404, {})));

    expect(screen.getByLabelText("Nombre completo", { exact: false })).toHaveValue("Nombre conservado");
    expect(screen.getByLabelText("Número de documento", { exact: false })).toHaveValue("1000000099");
    expect(sessionStorage.getItem("asodef:data-request-public-flow:v1")).toContain("Consulta conservada");
  });
});
