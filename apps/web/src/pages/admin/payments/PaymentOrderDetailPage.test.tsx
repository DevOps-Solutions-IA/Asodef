import { afterEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { PaymentOrderDetailPage } from "./PaymentOrderDetailPage";
import { buildCurrentUser, mockAuthFetch, renderWithAuth } from "../../../test-utils/auth-test-helpers";

function jsonResponse(status: number, body: unknown): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}

function buildOrder(overrides: Partial<{ status: string; statusLabel: string }> = {}) {
  return {
    id: "order-1",
    publicReference: "REF-0001",
    amountCents: 500_000,
    currency: "COP",
    status: overrides.status ?? "APPROVED",
    statusLabel: overrides.statusLabel ?? "Aprobado",
    createdAt: "2026-01-01T00:00:00.000Z",
    expiresAt: "2026-01-02T00:00:00.000Z",
    customer: { id: "customer-1", fullName: "Cliente de Prueba", documentType: "CC", documentNumber: "1000000000" },
    obligation: { concept: "Cuota mensual", dueDate: "2026-01-15T00:00:00.000Z" },
  };
}

function renderPage(currentUser: ReturnType<typeof buildCurrentUser>, additionalHandlers: (url: string, init: RequestInit | undefined) => Promise<Response> | undefined) {
  mockAuthFetch(currentUser, additionalHandlers);
  return renderWithAuth(
    <MemoryRouter initialEntries={["/admin/pagos/order-1"]}>
      <Routes>
        <Route path="/admin/pagos/:orderId" element={<PaymentOrderDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("PaymentOrderDetailPage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps sensitive refund actions disabled even when the actor has mutation permissions", async () => {
    renderPage(buildCurrentUser({ roles: ["FINANCE"], permissions: ["payments.read", "payments.refund", "payments.refund.approve"] }), (url) => {
      if (url.includes("/admin/payment-orders/order-1/events")) return jsonResponse(200, []);
      if (url.includes("/admin/refunds")) return jsonResponse(200, [{ id: "refund-1", paymentOrderId: "order-1", amountCents: 500_000, reason: "Dato sensible que no debe renderizarse", hasEvidence: false, status: "PENDING_APPROVAL", approvedByUserId: null, providerReference: null, createdAt: "2026-01-01T00:00:00.000Z" }]);
      if (url.includes("/admin/payment-orders/order-1")) return jsonResponse(200, buildOrder());
      return undefined;
    });

    expect(await screen.findByRole("button", { name: "Iniciar reembolso" })).toBeDisabled();
    expect(await screen.findByRole("button", { name: "Aprobar" })).toBeDisabled();
    expect(screen.getByText("ACTION_DISABLED_BACKEND_GOVERNANCE_REQUIRED")).toBeInTheDocument();
    expect(screen.queryByText("Dato sensible que no debe renderizarse")).not.toBeInTheDocument();
  });

  it("Negative case (AC): an actor with only payments.read sees the refund action disabled with an explanatory tooltip", async () => {
    renderPage(buildCurrentUser({ roles: ["FINANCE"], permissions: ["payments.read"] }), (url) => {
      if (url.includes("/admin/payment-orders/order-1/events")) return jsonResponse(200, []);
      if (url.includes("/admin/refunds")) return jsonResponse(200, []);
      if (url.includes("/admin/payment-orders/order-1")) return jsonResponse(200, buildOrder());
      return undefined;
    });

    const refundButton = await screen.findByRole("button", { name: "Iniciar reembolso" });
    expect(refundButton).toBeDisabled();
    expect(refundButton).toHaveAttribute("title", "ACTION_DISABLED_BACKEND_GOVERNANCE_REQUIRED");
  });

  it("renders sanitized event observability without exposing provider payload", async () => {
    renderPage(buildCurrentUser({ roles: ["FINANCE"], permissions: ["payments.read"] }), (url) => {
      if (url.includes("/admin/payment-orders/order-1/events")) return jsonResponse(200, [{ id: "event-1", source: "BOLD", eventType: "payment.approved", payload: { token: "never-render-this-value" }, receivedAt: "2026-01-01T00:00:00.000Z", processedAt: "2026-01-01T00:01:00.000Z" }]);
      if (url.includes("/admin/refunds")) return jsonResponse(200, []);
      if (url.includes("/admin/payment-orders/order-1")) return jsonResponse(200, buildOrder());
      return undefined;
    });

    expect(await screen.findByText("BOLD · payment.approved")).toBeInTheDocument();
    expect(screen.getByText("Procesado")).toBeInTheDocument();
    expect(screen.queryByText("never-render-this-value")).not.toBeInTheDocument();
  });
});
