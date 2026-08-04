import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { PaymentResultPage } from "./PaymentResultPage";

function jsonResponse(status: number, body: unknown): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}

function renderResultPage(fetchMock: ReturnType<typeof vi.fn>, initialPath = "/pagos/resultado?reference=ref-123") {
  vi.stubGlobal("fetch", fetchMock);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const routes = [
    { path: "/pagos", element: <div>Centro de Pagos</div> },
    { path: "/pagos/procesar/:publicReference", element: <div>Procesar pago</div> },
    { path: "/pagos/resultado", element: <PaymentResultPage /> },
  ];
  const router = createMemoryRouter(routes, { initialEntries: [initialPath] });
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

function statusResponse(orderStatus: string, orderStatusLabel: string) {
  return { publicReference: "ref-123", orderStatus, orderStatusLabel, attemptStatus: orderStatus };
}

describe("PaymentResultPage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("Example (AC): a mock-approved order shows the green confirmation state with a working Descargar comprobante link", async () => {
    const fetchMock = vi.fn(() => jsonResponse(200, statusResponse("APPROVED", "Aprobado")));
    renderResultPage(fetchMock);

    expect(await screen.findByRole("heading", { name: "Pago aprobado" })).toBeInTheDocument();
    expect(screen.getByText("Aprobado")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Descargar comprobante" });
    expect(link).toHaveAttribute("href", expect.stringContaining("/api/v1/receipts/ref-123?format=pdf"));
  });

  it("Negative case (AC): a mock-failed order shows the failure state with a retry action, never implying a double charge", async () => {
    const fetchMock = vi.fn(() => jsonResponse(200, statusResponse("FAILED", "Fallido")));
    const user = userEvent.setup();
    renderResultPage(fetchMock);

    expect(await screen.findByRole("heading", { name: "No pudimos procesar tu pago" })).toBeInTheDocument();
    const retryButton = screen.getByRole("button", { name: "Reintentar" });
    expect(retryButton).toBeInTheDocument();

    // Retry must send the customer back to start a genuinely new order,
    // never resubmit this exact (failed) order.
    await user.click(retryButton);
    expect(await screen.findByText("Centro de Pagos")).toBeInTheDocument();
  });

  it("shows the rejected state with retry and contact-support actions", async () => {
    const fetchMock = vi.fn(() => jsonResponse(200, statusResponse("REJECTED", "Rechazado")));
    renderResultPage(fetchMock);

    expect(await screen.findByRole("heading", { name: "Pago rechazado" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Contactar soporte" })).toHaveAttribute("href", expect.stringContaining("wa.me"));
  });

  it("shows the pending state with a refresh-status action", async () => {
    const fetchMock = vi.fn(() => jsonResponse(200, statusResponse("PROCESSING", "Procesando")));
    renderResultPage(fetchMock);

    expect(await screen.findByRole("heading", { name: "Pago en proceso" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Actualizar estado" })).toBeInTheDocument();
  });

  it("shows the expired state with a start-new-payment action", async () => {
    const fetchMock = vi.fn(() => jsonResponse(200, statusResponse("EXPIRED", "Vencido")));
    renderResultPage(fetchMock);

    expect(await screen.findByRole("heading", { name: "La orden expiró" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Iniciar un nuevo pago" })).toBeInTheDocument();
  });

  it("shows a generic state when no reference is provided in the URL, without crashing", () => {
    const fetchMock = vi.fn(() => jsonResponse(200, {}));
    renderResultPage(fetchMock, "/pagos/resultado");

    expect(screen.getByText("No se indicó un pago")).toBeInTheDocument();
  });

  it("shows a not-found state for a non-existent reference", async () => {
    const fetchMock = vi.fn(() => jsonResponse(404, { statusCode: 404, error: "Not Found", message: "No se encontraron resultados." }));
    renderResultPage(fetchMock, "/pagos/resultado?reference=does-not-exist");

    expect(await screen.findByText("Orden no encontrada")).toBeInTheDocument();
  });

  it("never renders a raw API error body", async () => {
    const fetchMock = vi.fn(() =>
      jsonResponse(500, { statusCode: 500, error: "Internal Server Error", message: "SQL error: relation does not exist" }),
    );
    renderResultPage(fetchMock);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).not.toMatch(/SQL|relation/i);
  });
});
