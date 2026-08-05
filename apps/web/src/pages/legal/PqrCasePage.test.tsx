import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PqrCasePage } from "./PqrCasePage";

function jsonResponse(status: number, body: unknown): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}

function renderPage(fetchMock: ReturnType<typeof vi.fn>) {
  vi.stubGlobal("fetch", fetchMock);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <PqrCasePage />
    </QueryClientProvider>,
  );
}

function field(label: string): HTMLElement {
  return screen.getByLabelText(label, { exact: false, selector: "input, textarea, select" });
}

async function fillAndSubmitValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.selectOptions(field("Categoría"), "reclamo");
  await user.type(field("Nombre completo"), "Titular de Prueba");
  await user.type(field("Correo o teléfono de contacto"), "titular@example.com");
  await user.type(field("Describe tu caso"), "No estoy de acuerdo con el cobro.");
  await user.click(screen.getByRole("button", { name: "Enviar caso" }));
}

describe("PqrCasePage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the 4 confirmed base categories with none preselected", () => {
    const fetchMock = vi.fn(() => jsonResponse(200, {}));
    renderPage(fetchMock);

    const select = field("Categoría") as HTMLSelectElement;
    expect(select.value).toBe("");
    expect(screen.getByRole("option", { name: "Petición" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Queja" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Reclamo" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Sugerencia" })).toBeInTheDocument();
  });

  it("Example (AC): submitting with category='reclamo' shows the returned case number", async () => {
    const fetchMock = vi.fn(() =>
      jsonResponse(201, {
        caseNumber: "test-case-number-abc123",
        category: "reclamo",
        status: "RECEIVED",
        description: "No estoy de acuerdo con el cobro.",
        resolution: null,
        createdAt: "2026-08-01T00:00:00.000Z",
      }),
    );
    const user = userEvent.setup();
    renderPage(fetchMock);

    await fillAndSubmitValidForm(user);

    expect(await screen.findByText("test-case-number-abc123")).toBeInTheDocument();
  });

  it("shows inline validation errors when submitted empty, without calling the API", async () => {
    const fetchMock = vi.fn();
    const user = userEvent.setup();
    renderPage(fetchMock);

    await user.click(screen.getByRole("button", { name: "Enviar caso" }));

    expect(await screen.findByText("Selecciona una categoría.")).toBeInTheDocument();
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

  it("Example (AC): looking up a case number shows its current status", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/pqr-cases/track-me")) {
        return jsonResponse(200, {
          caseNumber: "track-me",
          category: "queja",
          status: "IN_REVIEW",
          description: "Mi queja de prueba.",
          resolution: null,
          createdAt: "2026-08-01T00:00:00.000Z",
        });
      }
      return jsonResponse(404, { statusCode: 404, error: "Not Found", message: "No encontrado." });
    });
    const user = userEvent.setup();
    renderPage(fetchMock);

    await user.type(screen.getByLabelText("Número de caso"), "track-me");
    await user.click(screen.getByRole("button", { name: "Consultar" }));

    expect(await screen.findByText("En revisión")).toBeInTheDocument();
    expect(screen.getByText("Mi queja de prueba.")).toBeInTheDocument();
  });

  it("Negative case: looking up a non-existent case number shows a not-found message, not a blank/broken page", async () => {
    const fetchMock = vi.fn(() => jsonResponse(404, { statusCode: 404, error: "Not Found", message: "No encontrado." }));
    const user = userEvent.setup();
    renderPage(fetchMock);

    await user.type(screen.getByLabelText("Número de caso"), "no-existe");
    await user.click(screen.getByRole("button", { name: "Consultar" }));

    expect(await screen.findByText(/No encontramos un caso/)).toBeInTheDocument();
  });
});
