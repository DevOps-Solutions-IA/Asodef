import { afterEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AdminPaymentsPage } from "./AdminPaymentsPage";
import { buildCurrentUser, mockAuthFetch, renderWithAuth } from "../../../test-utils/auth-test-helpers";

function jsonResponse(status: number, body: unknown): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}

function buildOrder() {
  return {
    id: "order-1",
    publicReference: "REF-0001",
    amountCents: 500_000,
    currency: "COP",
    status: "APPROVED",
    statusLabel: "Aprobado",
    createdAt: "2026-01-01T00:00:00.000Z",
    expiresAt: "2026-01-02T00:00:00.000Z",
    customer: { id: "customer-1", fullName: "Cliente de Prueba", documentType: "CC", documentNumber: "1000000000" },
    obligation: { concept: "Cuota mensual", dueDate: "2026-01-15T00:00:00.000Z" },
  };
}

function renderPage(additionalHandlers: (url: string, init: RequestInit | undefined) => Promise<Response> | undefined) {
  mockAuthFetch(buildCurrentUser({ roles: ["FINANCE"], permissions: ["payments.read"] }), additionalHandlers);
  return renderWithAuth(
    <MemoryRouter initialEntries={["/admin/pagos"]}>
      <AdminPaymentsPage />
    </MemoryRouter>,
  );
}

describe("AdminPaymentsPage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("US-063 AC1: lists matching orders", async () => {
    renderPage((url) => {
      if (url.includes("/admin/payment-orders/search")) return jsonResponse(200, { items: [buildOrder()], total: 1, page: 1, pageSize: 20 });
      return undefined;
    });

    expect(await screen.findByText("Cliente de Prueba")).toBeInTheDocument();
    expect(screen.getByText("REF-0001")).toBeInTheDocument();
  });

  it("re-fetches with the search term as a query parameter", async () => {
    let lastUrl = "";
    renderPage((url) => {
      lastUrl = url;
      if (url.includes("/admin/payment-orders/search")) return jsonResponse(200, { items: [], total: 0, page: 1, pageSize: 20 });
      return undefined;
    });

    await screen.findByText("No hay órdenes que coincidan");
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Buscar"), "1000000000");

    expect(lastUrl).toContain("search=1000000000");
  });
});
