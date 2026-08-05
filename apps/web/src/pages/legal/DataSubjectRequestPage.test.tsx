import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DataSubjectRequestPage } from "./DataSubjectRequestPage";

function jsonResponse(status: number, body: unknown): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}

function field(label: string): HTMLElement {
  return screen.getByLabelText(label, { exact: false, selector: "input, textarea, select" });
}

function renderPage(fetchMock: ReturnType<typeof vi.fn>) {
  vi.stubGlobal("fetch", fetchMock);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <DataSubjectRequestPage />
    </QueryClientProvider>,
  );
}

async function fillAndSubmitValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.selectOptions(field("Tipo de solicitud"), "DELETION");
  await user.type(field("Nombre completo"), "Titular de Prueba");
  await user.type(field("Número de documento"), "1000000099");
  await user.type(field("Correo electrónico"), "titular@example.com");
  await user.type(field("Describe tu solicitud"), "Quiero eliminar mis datos.");
  await user.click(screen.getByRole("button", { name: "Enviar solicitud" }));
}

describe("DataSubjectRequestPage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders all 11 request types with none preselected", () => {
    const fetchMock = vi.fn(() => jsonResponse(200, {}));
    renderPage(fetchMock);

    const select = field("Tipo de solicitud") as HTMLSelectElement;
    expect(select.value).toBe("");
    expect(screen.getAllByRole("option")).toHaveLength(12); // 11 types + the disabled placeholder
  });

  it("Example (AC): submitting a deletion request shows the returned tracking reference", async () => {
    const fetchMock = vi.fn(() =>
      jsonResponse(201, {
        publicReference: "test-tracking-reference-abc123",
        type: "DELETION",
        status: "RECEIVED",
        description: "Quiero eliminar mis datos.",
        resolution: null,
        createdAt: "2026-08-01T00:00:00.000Z",
      }),
    );
    const user = userEvent.setup();
    renderPage(fetchMock);

    await fillAndSubmitValidForm(user);

    expect(await screen.findByText("test-tracking-reference-abc123")).toBeInTheDocument();
  });

  it("shows inline validation errors when submitted empty, without calling the API", async () => {
    const fetchMock = vi.fn();
    const user = userEvent.setup();
    renderPage(fetchMock);

    await user.click(screen.getByRole("button", { name: "Enviar solicitud" }));

    expect(await screen.findByText("Selecciona el tipo de solicitud.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never renders a raw API error body for a server error", async () => {
    const fetchMock = vi.fn(() =>
      jsonResponse(500, { statusCode: 500, error: "Internal Server Error", message: "SQL error: relation does not exist" }),
    );
    const user = userEvent.setup();
    renderPage(fetchMock);

    await fillAndSubmitValidForm(user);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).not.toMatch(/SQL|relation/i);
  });

  it("Example (AC): looking up a reference shows its current status", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/data-subject-requests/track-me")) {
        return jsonResponse(200, {
          publicReference: "track-me",
          type: "ACCESS",
          status: "IN_REVIEW",
          description: "Quiero acceder a mis datos.",
          resolution: null,
          createdAt: "2026-08-01T00:00:00.000Z",
        });
      }
      return jsonResponse(404, { statusCode: 404, error: "Not Found", message: "No encontrado." });
    });
    const user = userEvent.setup();
    renderPage(fetchMock);

    await user.type(screen.getByLabelText("Referencia de seguimiento"), "track-me");
    await user.click(screen.getByRole("button", { name: "Consultar" }));

    expect(await screen.findByText("En revisión")).toBeInTheDocument();
    expect(screen.getByText("Quiero acceder a mis datos.")).toBeInTheDocument();
  });

  it("Negative case (AC): looking up a non-existent reference shows a not-found message, not a blank/broken page", async () => {
    const fetchMock = vi.fn(() => jsonResponse(404, { statusCode: 404, error: "Not Found", message: "No encontrado." }));
    const user = userEvent.setup();
    renderPage(fetchMock);

    await user.type(screen.getByLabelText("Referencia de seguimiento"), "no-existe");
    await user.click(screen.getByRole("button", { name: "Consultar" }));

    expect(await screen.findByText(/No encontramos una solicitud/)).toBeInTheDocument();
  });
});
