import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

  it("Example (AC): initiating then approving a refund updates the visible status to Reembolsado", async () => {
    let order = buildOrder({ status: "APPROVED", statusLabel: "Aprobado" });
    let refunds: Array<Record<string, unknown>> = [];

    renderPage(buildCurrentUser({ roles: ["FINANCE"], permissions: ["payments.read", "payments.refund", "payments.refund.approve"] }), (url, init) => {
      if (url.includes("/admin/payment-orders/order-1/events")) return jsonResponse(200, []);
      if (url.includes("/admin/refunds") && init?.method === "POST" && url.includes("approve")) {
        refunds = refunds.map((r) => ({ ...r, status: "APPROVED" }));
        order = buildOrder({ status: "REFUNDED", statusLabel: "Reembolsado" });
        return jsonResponse(200, refunds[0]);
      }
      if (url.includes("/admin/refunds")) return jsonResponse(200, refunds);
      if (url.includes("/payments/REF-0001/refund") && init?.method === "POST") {
        const newRefund = { id: "refund-1", paymentOrderId: "order-1", amountCents: 500_000, reason: "Prueba", hasEvidence: false, status: "PENDING_APPROVAL", approvedByUserId: null, providerReference: null, createdAt: "2026-01-01T00:00:00.000Z" };
        refunds = [newRefund];
        return jsonResponse(201, newRefund);
      }
      if (url.includes("/admin/payment-orders/order-1")) return jsonResponse(200, order);
      return undefined;
    });

    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Iniciar reembolso" }));

    await screen.findByRole("dialog");
    await user.type(screen.getByLabelText("Monto (centavos COP)", { exact: false }), "500000");
    await user.type(screen.getByLabelText("Motivo"), "Prueba de reembolso completo.");
    await user.click(screen.getByRole("button", { name: "Solicitar reembolso" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const approveButton = await screen.findByRole("button", { name: "Aprobar" });
    await user.click(approveButton);

    await waitFor(async () => {
      expect(await screen.findByText("Reembolsado")).toBeInTheDocument();
    });
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
    expect(refundButton).toHaveAttribute("title", "No tienes permiso para solicitar reembolsos.");
  });
});
