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

  it("revalidates Master debt but never opens the modern payment-order create path before write-back is ready", async () => {
    const selectionToken = "master.v1.opaque-test-token";
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/payments/lookup")) {
        return jsonResponse(200, {
          type: "customer",
          customer: { fullName: "ANA PEREZ", documentType: "CC", maskedDocumentNumber: "•••••6789" },
          obligations: [{
            obligationId: selectionToken,
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
      if (url.includes("/payment-orders/master/preflight")) {
        return jsonResponse(200, {
          source: "master",
          customer: { fullName: "ANA PEREZ", documentType: "CC", maskedDocumentNumber: "•••••6789" },
          obligation: {
            concept: "Cuota 8",
            amountCents: 760000,
            currency: "COP",
            dueDate: "2026-08-15T12:00:00.000Z",
            status: "OVERDUE",
          },
          onlinePaymentAvailable: false,
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
    expect(screen.queryByRole("button", { name: "Pagar" })).not.toBeInTheDocument();
    expect(screen.getByText(/consultadas directamente en el sistema maestro/i)).toBeInTheDocument();
    expect(screen.getByText(/pago en línea en integración/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Verificar saldo" }));

    expect(await screen.findByRole("button", { name: "Saldo verificado" })).toBeDisabled();
    expect(screen.getByText("$ 7.600,00")).toBeInTheDocument();

    const preflightCall = fetchMock.mock.calls.find(([input]) => String(input).includes("/payment-orders/master/preflight"));
    expect(preflightCall).toBeDefined();
    const preflightBody = JSON.parse((preflightCall![1] as RequestInit).body as string) as { selectionToken: string };
    expect(preflightBody).toEqual({ selectionToken });

    expect(fetchMock.mock.calls.some(([input]) => /\/payment-orders$/.test(String(input)))).toBe(false);
  });
});
