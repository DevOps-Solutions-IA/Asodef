import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { ReceiptViewPage } from "./ReceiptViewPage";

function jsonResponse(status: number, body: unknown): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}

function renderReceiptPage(fetchMock: ReturnType<typeof vi.fn>, initialPath = "/pagos/comprobante/ref-123") {
  vi.stubGlobal("fetch", fetchMock);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const routes = [{ path: "/pagos/comprobante/:publicReference", element: <ReceiptViewPage /> }];
  const router = createMemoryRouter(routes, { initialEntries: [initialPath] });
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

function buildReceipt(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    publicReference: "ref-123",
    receiptNumber: "RCP-ABCD123456",
    verificationCode: "A1B2C3D4E5F6",
    issuedAt: "2026-08-04T12:00:00.000Z",
    customerFullName: "Cliente Demo Uno",
    maskedDocumentNumber: "••••••0001",
    concept: "Cuota de prueba",
    amountCents: 5_000_000,
    currency: "COP",
    status: "APPROVED",
    statusLabel: "Aprobado",
    dueDate: "2026-08-19T12:43:19.951Z",
    ...overrides,
  };
}

describe("ReceiptViewPage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("Example (AC): shows matching amount/date/reference for a mock-approved order and a working PDF download link", async () => {
    const fetchMock = vi.fn(() => jsonResponse(200, buildReceipt()));
    renderReceiptPage(fetchMock);

    expect(await screen.findByText("RCP-ABCD123456")).toBeInTheDocument();
    expect(screen.getByText("A1B2C3D4E5F6")).toBeInTheDocument();
    expect(screen.getByText("ref-123")).toBeInTheDocument();
    expect(screen.getByText("$ 50.000", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("Cuota de prueba")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Descargar PDF" });
    expect(link).toHaveAttribute("href", expect.stringContaining("/api/v1/receipts/ref-123?format=pdf"));
  });

  it("Negative case (AC): a non-approved order shows an appropriate empty state, not a broken render", async () => {
    const fetchMock = vi.fn(() => jsonResponse(404, { statusCode: 404, error: "Not Found", message: "No se encontraron resultados." }));
    renderReceiptPage(fetchMock);

    expect(await screen.findByText("Comprobante no disponible")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Descargar PDF" })).not.toBeInTheDocument();
  });

  it("never renders a raw API error body", async () => {
    const fetchMock = vi.fn(() =>
      jsonResponse(500, { statusCode: 500, error: "Internal Server Error", message: "SQL error: relation does not exist" }),
    );
    renderReceiptPage(fetchMock);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).not.toMatch(/SQL|relation/i);
  });
});
