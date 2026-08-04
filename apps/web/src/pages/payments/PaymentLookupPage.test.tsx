import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { PaymentLookupPage } from "./PaymentLookupPage";

function jsonResponse(status: number, body: unknown): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}

function renderPaymentLookupPage(fetchMock: ReturnType<typeof vi.fn>) {
  vi.stubGlobal("fetch", fetchMock);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const routes = [
    { path: "/pagos", element: <PaymentLookupPage /> },
    { path: "/pagos/orden/:publicReference", element: <div>Resumen de la orden</div> },
  ];
  const router = createMemoryRouter(routes, { initialEntries: ["/pagos"] });
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe("PaymentLookupPage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the lookup form in document mode by default", () => {
    renderPaymentLookupPage(vi.fn());

    expect(screen.getByRole("heading", { name: "Centro de Pagos" })).toBeInTheDocument();
    expect(screen.getByLabelText("Tipo de documento", { exact: false })).toBeInTheDocument();
    expect(screen.getByLabelText("Número de documento", { exact: false })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Buscar" })).toBeInTheDocument();
  });

  it("Example (AC): searching by document returns the customer's obligations with a Pagar action each", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/payments/lookup")) {
        return jsonResponse(200, {
          type: "customer",
          customer: { fullName: "Cliente Demo Uno", documentType: "CC", maskedDocumentNumber: "••••••0001" },
          obligations: [
            {
              obligationId: "obl-1",
              concept: "Cuota de prueba - Cliente Demo Uno",
              amountCents: 5_000_000,
              currency: "COP",
              dueDate: "2026-08-19T12:43:19.951Z",
              status: "PENDING",
            },
          ],
        });
      }
      return jsonResponse(200, {});
    });

    const user = userEvent.setup();
    renderPaymentLookupPage(fetchMock);

    await user.type(screen.getByLabelText("Número de documento", { exact: false }), "1000000001");
    await user.click(screen.getByRole("button", { name: "Buscar" }));

    expect(await screen.findByText("Cliente Demo Uno")).toBeInTheDocument();
    expect(screen.getByText("••••••0001", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("Cuota de prueba - Cliente Demo Uno")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pagar" })).toBeInTheDocument();
  });

  it("clicking Pagar creates a payment order and navigates to the order summary route", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, _init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/payments/lookup")) {
        return jsonResponse(200, {
          type: "customer",
          customer: { fullName: "Cliente Demo Uno", documentType: "CC", maskedDocumentNumber: "••••••0001" },
          obligations: [
            {
              obligationId: "obl-1",
              concept: "Cuota de prueba",
              amountCents: 5_000_000,
              currency: "COP",
              dueDate: "2026-08-19T12:43:19.951Z",
              status: "PENDING",
            },
          ],
        });
      }
      if (url.includes("/payment-orders")) {
        return jsonResponse(201, {
          publicReference: "abc123ref",
          amountCents: 5_000_000,
          currency: "COP",
          status: "PENDING",
          statusLabel: "Pendiente",
          createdAt: "2026-08-19T12:43:19.951Z",
          expiresAt: "2026-08-19T13:13:19.951Z",
          obligation: { concept: "Cuota de prueba", dueDate: "2026-08-19T12:43:19.951Z" },
        });
      }
      return jsonResponse(200, {});
    });

    const user = userEvent.setup();
    renderPaymentLookupPage(fetchMock);

    await user.type(screen.getByLabelText("Número de documento", { exact: false }), "1000000001");
    await user.click(screen.getByRole("button", { name: "Buscar" }));
    await user.click(await screen.findByRole("button", { name: "Pagar" }));

    expect(await screen.findByText("Resumen de la orden")).toBeInTheDocument();
    const orderCall = fetchMock.mock.calls.find(([input]) => String(input).includes("/payment-orders"));
    expect(orderCall).toBeDefined();
    const body = JSON.parse((orderCall![1] as RequestInit).body as string) as { obligationId: string };
    expect(body).toEqual({ obligationId: "obl-1" });
  });

  it("Negative case (AC): searching with an unknown document shows a clear no-results state, not a raw error or blank screen", async () => {
    const fetchMock = vi.fn(() =>
      jsonResponse(404, { statusCode: 404, error: "Not Found", message: "No se encontraron resultados." }),
    );

    const user = userEvent.setup();
    renderPaymentLookupPage(fetchMock);

    await user.type(screen.getByLabelText("Número de documento", { exact: false }), "9999999999");
    await user.click(screen.getByRole("button", { name: "Buscar" }));

    expect(await screen.findByText("No se encontraron resultados")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Centro de Pagos" })).toBeInTheDocument();
  });

  it("shows an inline validation error and does not call the API when the document number is empty", async () => {
    const fetchMock = vi.fn(() => jsonResponse(200, {}));
    const user = userEvent.setup();
    renderPaymentLookupPage(fetchMock);

    await user.click(screen.getByRole("button", { name: "Buscar" }));

    expect(await screen.findByText("El número de documento es requerido.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining("/payments/lookup"), expect.anything());
  });

  it("switches to reference mode and searches by reference directly", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/payments/lookup")) {
        return jsonResponse(200, {
          type: "order",
          order: {
            publicReference: "xyz789ref",
            amountCents: 100_000,
            currency: "COP",
            status: "PENDING",
            statusLabel: "Pendiente",
            createdAt: "2026-08-19T12:43:19.951Z",
            expiresAt: "2026-08-19T13:13:19.951Z",
            obligation: { concept: "Cuota", dueDate: "2026-08-19T12:43:19.951Z" },
          },
        });
      }
      return jsonResponse(200, {});
    });

    const user = userEvent.setup();
    renderPaymentLookupPage(fetchMock);

    await user.click(screen.getByRole("radio", { name: "Por referencia de pago" }));
    expect(screen.queryByLabelText("Número de documento", { exact: false })).not.toBeInTheDocument();

    await user.type(screen.getByLabelText(/^Referencia de pago/), "xyz789ref");
    await user.click(screen.getByRole("button", { name: "Buscar" }));

    expect(await screen.findByText("Resumen de la orden")).toBeInTheDocument();
  });

  it("never renders a raw API error body", async () => {
    const fetchMock = vi.fn(() =>
      jsonResponse(500, { statusCode: 500, error: "Internal Server Error", message: "SQL error: relation does not exist" }),
    );
    const user = userEvent.setup();
    renderPaymentLookupPage(fetchMock);

    await user.type(screen.getByLabelText("Número de documento", { exact: false }), "1000000001");
    await user.click(screen.getByRole("button", { name: "Buscar" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).not.toMatch(/SQL|relation/i);
  });
});
