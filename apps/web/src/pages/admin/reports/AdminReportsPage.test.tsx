import { afterEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AdminReportsPage } from "./AdminReportsPage";
import { buildCurrentUser, mockAuthFetch, renderWithAuth } from "../../../test-utils/auth-test-helpers";

function jsonResponse(status: number, body: unknown): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}

const REPORTS_LIST = [
  { key: "payments", label: "Pagos por fecha/estado" },
  { key: "refunds", label: "Reembolsos" },
];

function renderPage(additionalHandlers: (url: string, init: RequestInit | undefined) => Promise<Response> | undefined) {
  mockAuthFetch(buildCurrentUser({ roles: ["FINANCE"], permissions: ["reports.read"] }), additionalHandlers);
  return renderWithAuth(
    <MemoryRouter initialEntries={["/admin/reportes"]}>
      <AdminReportsPage />
    </MemoryRouter>,
  );
}

describe("AdminReportsPage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("US-064 AC2: lists available reports and runs the selected one", async () => {
    renderPage((url) => {
      if (url.includes("/admin/reports/payments")) return jsonResponse(200, { items: [{ publicReference: "REF-1", status: "APPROVED" }], total: 1 });
      if (url.includes("/admin/reports")) return jsonResponse(200, REPORTS_LIST);
      return undefined;
    });

    const user = userEvent.setup();
    await user.click(await screen.findByText("Pagos por fecha/estado"));
    await user.click(screen.getByRole("button", { name: "Ejecutar" }));

    expect(await screen.findByText("REF-1")).toBeInTheDocument();
  });

  it("Negative case (AC): zero matching records shows an empty state, not an error", async () => {
    renderPage((url) => {
      if (url.includes("/admin/reports/payments")) return jsonResponse(200, { items: [], total: 0 });
      if (url.includes("/admin/reports")) return jsonResponse(200, REPORTS_LIST);
      return undefined;
    });

    const user = userEvent.setup();
    await user.click(await screen.findByText("Pagos por fecha/estado"));
    await user.click(screen.getByRole("button", { name: "Ejecutar" }));

    expect(await screen.findByText("Sin resultados")).toBeInTheDocument();
  });

  it("shows a downloadable-when-ready state for a background export job", async () => {
    renderPage((url) => {
      if (url.includes("/admin/reports/exports/job-1")) return jsonResponse(200, { id: "job-1", reportKey: "payments", status: "READY", rowCount: 1500, errorMessage: null, createdAt: "2026-01-01T00:00:00.000Z", completedAt: "2026-01-01T00:00:05.000Z" });
      if (url.includes("/admin/reports/payments")) return jsonResponse(202, { jobId: "job-1", rowCount: 1500, status: "PENDING" });
      if (url.includes("/admin/reports")) return jsonResponse(200, REPORTS_LIST);
      return undefined;
    });

    const user = userEvent.setup();
    await user.click(await screen.findByText("Pagos por fecha/estado"));
    await user.click(screen.getByRole("button", { name: "Ejecutar" }));

    expect(await screen.findByText(/Exportación lista/, {}, { timeout: 3000 })).toBeInTheDocument();
  });
});
