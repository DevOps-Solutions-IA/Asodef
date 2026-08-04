import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { PaymentProcessPage } from "./PaymentProcessPage";

function jsonResponse(status: number, body: unknown): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}

function renderPaymentProcessPage(fetchMock: ReturnType<typeof vi.fn>, initialPath = "/pagos/procesar/ref-123") {
  vi.stubGlobal("fetch", fetchMock);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const routes = [
    { path: "/pagos", element: <div>Centro de Pagos</div> },
    { path: "/pagos/procesar/:publicReference", element: <PaymentProcessPage /> },
  ];
  const router = createMemoryRouter(routes, { initialEntries: [initialPath] });
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe("PaymentProcessPage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("Example (AC): a valid PENDING order automatically triggers the Bold create call and shows the mock confirmation", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, _init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/payments/bold/create")) {
        return jsonResponse(201, {
          publicReference: "ref-123",
          orderStatus: "APPROVED",
          orderStatusLabel: "Aprobado",
          providerNextAction: { status: "APPROVED" },
        });
      }
      return jsonResponse(200, {});
    });

    renderPaymentProcessPage(fetchMock);

    expect(await screen.findByText("Simulación de pago Bold")).toBeInTheDocument();
    expect(screen.getByText("Modo prueba")).toBeInTheDocument();
    expect(screen.getByText("Aprobado")).toBeInTheDocument();
    expect(screen.getByText("Referencia: ref-123")).toBeInTheDocument();

    const createCalls = fetchMock.mock.calls.filter(([input]) => String(input).includes("/payments/bold/create"));
    expect(createCalls).toHaveLength(1);
    const body = JSON.parse((createCalls[0]![1] as RequestInit).body as string) as { reference: string };
    expect(body).toEqual({ reference: "ref-123" });
  });

  it("Negative case (AC): a non-existent reference shows a not-found state without crashing", async () => {
    const fetchMock = vi.fn(() =>
      jsonResponse(404, { statusCode: 404, error: "Not Found", message: "No se encontraron resultados." }),
    );

    renderPaymentProcessPage(fetchMock, "/pagos/procesar/does-not-exist");

    expect(await screen.findByText("Orden no encontrada")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Volver al Centro de Pagos" })).toBeInTheDocument();
  });

  it("falls back to reading the current status when the order already has a final/in-flight attempt (409)", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/payments/bold/create")) {
        return jsonResponse(409, { statusCode: 409, error: "Conflict", message: "Esta orden de pago no admite un nuevo intento de cobro." });
      }
      if (url.includes("/status")) {
        return jsonResponse(200, { publicReference: "ref-123", orderStatus: "APPROVED", orderStatusLabel: "Aprobado", attemptStatus: "APPROVED" });
      }
      return jsonResponse(200, {});
    });

    renderPaymentProcessPage(fetchMock);

    expect(await screen.findByText("Simulación de pago Bold")).toBeInTheDocument();
    expect(await screen.findByText("Aprobado")).toBeInTheDocument();
  });

  it("never renders a raw API error body on an unexpected failure", async () => {
    const fetchMock = vi.fn(() =>
      jsonResponse(500, { statusCode: 500, error: "Internal Server Error", message: "SQL error: relation does not exist" }),
    );

    renderPaymentProcessPage(fetchMock);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).not.toMatch(/SQL|relation/i);
  });

  it("does not expose the internal database id anywhere in the confirmation", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/payments/bold/create")) {
        return jsonResponse(201, {
          publicReference: "ref-123",
          orderStatus: "PROCESSING",
          orderStatusLabel: "Procesando",
          providerNextAction: { status: "PROCESSING" },
        });
      }
      return jsonResponse(200, {});
    });

    renderPaymentProcessPage(fetchMock);

    expect(await screen.findByText("Referencia: ref-123")).toBeInTheDocument();
    expect(screen.queryByText(/^[0-9a-f]{8}-[0-9a-f]{4}-/i)).not.toBeInTheDocument();
  });
});
