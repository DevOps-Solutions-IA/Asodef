import { afterEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AdminReconciliationPage } from "./AdminReconciliationPage";
import { buildCurrentUser, mockAuthFetch, renderWithAuth } from "../../../test-utils/auth-test-helpers";

function jsonResponse(status: number, body: unknown): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}

function buildRun() {
  return {
    id: "run-1",
    runDate: "2026-01-01T00:00:00.000Z",
    rangeStart: "2026-01-01T00:00:00.000Z",
    rangeEnd: "2026-01-02T00:00:00.000Z",
    responsibleUserId: "user-1",
    differencesFound: 1,
    resolutionStatus: "OPEN",
    notes: null,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function buildDifference(overrides: Partial<{ resolutionStatus: string }> = {}) {
  return {
    id: "diff-1",
    reconciliationId: "run-1",
    paymentOrderId: "order-1",
    kind: "AMOUNT_MISMATCH",
    details: {},
    resolutionStatus: overrides.resolutionStatus ?? "OPEN",
    resolutionNotes: null,
    resolvedByUserId: null,
    resolvedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function renderPage(currentUser: ReturnType<typeof buildCurrentUser>, additionalHandlers: (url: string, init: RequestInit | undefined) => Promise<Response> | undefined) {
  mockAuthFetch(currentUser, additionalHandlers);
  return renderWithAuth(
    <MemoryRouter initialEntries={["/admin/conciliacion"]}>
      <AdminReconciliationPage />
    </MemoryRouter>,
  );
}

describe("AdminReconciliationPage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("lists runs and shows a selected run's differences", async () => {
    renderPage(buildCurrentUser({ roles: ["FINANCE"], permissions: ["payments.reconcile"] }), (url) => {
      if (url.includes("/admin/reconciliation/runs/run-1/differences")) return jsonResponse(200, [buildDifference()]);
      if (url.includes("/admin/reconciliation/runs")) return jsonResponse(200, [buildRun()]);
      return undefined;
    });

    const user = userEvent.setup();
    await user.click(await screen.findByText(/1 diferencia/));

    await screen.findByRole("heading", { name: "Diferencias" });
    expect(screen.getAllByText("Diferencia de monto").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("button", { name: "Resolver" })).toBeInTheDocument();
  });

  it("Negative case: the resolve action is disabled without payments.reconcile", async () => {
    renderPage(buildCurrentUser({ roles: ["CUSTOMER_SERVICE"], permissions: ["pqr.manage"] }), (url) => {
      if (url.includes("/admin/reconciliation/runs/run-1/differences")) return jsonResponse(200, [buildDifference()]);
      if (url.includes("/admin/reconciliation/runs")) return jsonResponse(200, [buildRun()]);
      return undefined;
    });

    const user = userEvent.setup();
    await user.click(await screen.findByText(/1 diferencia/));

    expect(await screen.findByRole("button", { name: "Resolver" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Ejecutar conciliación" })).toBeDisabled();
  });
});
