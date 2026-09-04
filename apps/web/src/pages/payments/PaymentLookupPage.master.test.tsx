import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { PaymentLookupPage } from "./PaymentLookupPage";

function jsonResponse(status: number, body: unknown): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}

function renderPage(fetchMock: ReturnType<typeof vi.fn>) {
  vi.stubGlobal("fetch", fetchMock);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const router = createMemoryRouter([{ path: "/pagos", element: <PaymentLookupPage /> }], { initialEntries: ["/pagos"] });
  return render(<QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider>);
}

describe("PaymentLookupPage with Master obligations", () => {
  afterEach(() => vi.restoreAllMocks());

  it("shows real Master debt but never opens the modern payment-order path before write-back is ready", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/payments/lookup")) {
        return jsonResponse(200, {
          type: "customer",
          customer: { fullName: "ANA PEREZ", documentType: "CC", maskedDocumentNumber: "•••••6789" },
          obligations: [{
            obligationId: "master:100:I-8",
            concept: "Cuota 8",
            amountCents: 750000,
            currency: "COP",
            dueDate: "2026-08-15T12:00:00.000Z",
            status: "OVERDUE",
            source: "master",
            onlinePaymentAvailable: false,
          }],
        });
      }
      return jsonResponse(500, { message: "unexpected request" });
    });

    const user = userEvent.setup();
    renderPage(fetchMock);
    await user.type(screen.getByLabelText("Número de documento", { exact: false }), "123456789");
    await user.click(screen.getByRole("button", { name: "Buscar" }));

    expect(await screen.findByText("ANA PEREZ")).toBeInTheDocument();
    expect(screen.getByText("Cuota 8")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pago en integración" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Pagar" })).not.toBeInTheDocument();
    expect(screen.getByText(/consultadas directamente en el sistema maestro/i)).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes("/payment-orders"))).toBe(false);
  });
});
