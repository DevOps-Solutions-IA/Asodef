import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { OrderSummaryPage } from "./OrderSummaryPage";

function jsonResponse(status: number, body: unknown): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}

function renderOrderSummaryPage(fetchMock: ReturnType<typeof vi.fn>, initialPath = "/pagos/orden/ref-123") {
  vi.stubGlobal("fetch", fetchMock);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const routes = [
    { path: "/pagos", element: <div>Centro de Pagos</div> },
    { path: "/pagos/orden/:publicReference", element: <OrderSummaryPage /> },
    { path: "/pagos/procesar/:publicReference", element: <div>Procesar pago</div> },
  ];
  const router = createMemoryRouter(routes, { initialEntries: [initialPath] });
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

function buildOrder(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    publicReference: "ref-123",
    amountCents: 5_000_000,
    currency: "COP",
    status: "PENDING",
    statusLabel: "Pendiente",
    createdAt: "2026-08-01T00:00:00.000Z",
    expiresAt: "2026-08-01T00:30:00.000Z",
    obligation: { concept: "Cuota de prueba", dueDate: "2026-08-19T12:43:19.951Z" },
    ...overrides,
  };
}

describe("OrderSummaryPage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows concept, amount, due date, status, and a modo prueba badge for a PENDING order", async () => {
    const fetchMock = vi.fn(() => jsonResponse(200, buildOrder()));
    renderOrderSummaryPage(fetchMock);

    expect(await screen.findByText("Cuota de prueba")).toBeInTheDocument();
    expect(screen.getByText("$ 50.000", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("Pendiente")).toBeInTheDocument();
    expect(screen.getByText("Modo prueba")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continuar al pago" })).toBeInTheDocument();
  });

  it("navigates to the process screen when Continuar al pago is clicked", async () => {
    const fetchMock = vi.fn(() => jsonResponse(200, buildOrder()));
    const user = userEvent.setup();
    renderOrderSummaryPage(fetchMock);

    await user.click(await screen.findByRole("button", { name: "Continuar al pago" }));

    expect(await screen.findByText("Procesar pago")).toBeInTheDocument();
  });

  it("hides the continue action and shows a not-payable message for an already-APPROVED order", async () => {
    const fetchMock = vi.fn(() => jsonResponse(200, buildOrder({ status: "APPROVED", statusLabel: "Aprobado" })));
    renderOrderSummaryPage(fetchMock);

    expect(await screen.findByText("Aprobado")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Continuar al pago" })).not.toBeInTheDocument();
    expect(screen.getByText(/ya no admite un nuevo intento/i)).toBeInTheDocument();
  });

  it("shows a not-found state for a non-existent reference, without crashing", async () => {
    const fetchMock = vi.fn(() => jsonResponse(404, { statusCode: 404, error: "Not Found", message: "No se encontraron resultados." }));
    renderOrderSummaryPage(fetchMock, "/pagos/orden/does-not-exist");

    expect(await screen.findByText("Orden no encontrada")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Volver al Centro de Pagos" })).toBeInTheDocument();
  });

  it("never renders a raw API error body for a server error", async () => {
    const fetchMock = vi.fn(() =>
      jsonResponse(500, { statusCode: 500, error: "Internal Server Error", message: "SQL error: relation does not exist" }),
    );
    renderOrderSummaryPage(fetchMock);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).not.toMatch(/SQL|relation/i);
  });
});
