import { afterEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AdminDashboardPage } from "./AdminDashboardPage";
import {
  buildCurrentUser,
  mockAuthFetch,
  renderWithAuth,
} from "../../test-utils/auth-test-helpers";

function jsonResponse(status: number, body: unknown): Promise<Response> {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

const DASHBOARD = {
  newProspects30d: 3,
  openOpportunities: 6,
  opportunitiesByStage: { NEW_PROSPECT: 2, ACTIVE_PARTNER: 1 },
  conversionRate: 0.25,
  activeCompanies: 4,
  activeAgreements: 2,
  contractsPendingSignature: 1,
  contractsNearingExpiration: 2,
  activeContracts: 8,
  expiredContracts: 1,
  commercialActivities30d: 5,
  leadsWithoutFollowUp: 2,
  opportunitiesWon: 1,
  opportunitiesLost: 0,
  recaudoDiarioCents: 500000,
  recaudoMensualCents: 3000000,
  pagosAprobados: 10,
  pagosPendientes: 3,
  pagosRechazados: 1,
  tasaAprobacion: 0.9,
  obligacionesPendientes: 7,
  obligacionesVencidas: 2,
  reconciliationDifferencesOpen: 1,
  openPqrCases: 5,
  overduePqrCases: 1,
  openDataSubjectRequests: 4,
  overdueDataSubjectRequests: 2,
  pendingApprovalGates: 3,
};

function renderPage(onRequest?: (url: string) => void) {
  mockAuthFetch(
    buildCurrentUser({
      roles: ["SUPER_ADMIN"],
      permissions: ["settings.manage", "users.read", "users.security.read"],
    }),
    (url) => {
      onRequest?.(url);
      if (url.includes("/admin/dashboard")) return jsonResponse(200, DASHBOARD);
      return undefined;
    },
  );
  return renderWithAuth(
    <MemoryRouter initialEntries={["/admin"]}>
      <AdminDashboardPage />
    </MemoryRouter>,
  );
}

describe("AdminDashboardPage", () => {
  afterEach(() => vi.restoreAllMocks());

  it("shows the real executive, attention, commercial, contract, financial and administrative metrics", async () => {
    renderPage();
    expect(
      await screen.findByRole("heading", { name: "Resumen ejecutivo" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Requiere atención" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Comercial" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Contratos" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Financiero" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Gestión administrativa" }),
    ).toBeInTheDocument();
    expect(screen.getByText("$ 30.000")).toBeInTheDocument();
    expect(
      screen.getAllByText("Aprobaciones pendientes").length,
    ).toBeGreaterThan(0);
  });

  it("never queries or renders technical runtime, user-account or personal-security data", async () => {
    const calls: string[] = [];
    renderPage((url) => calls.push(url));
    await screen.findByRole("heading", { name: "Resumen ejecutivo" });
    expect(
      calls.some((url) => /admin\/sistema|admin\/users|auth\/mfa/.test(url)),
    ).toBe(false);
    for (const label of [
      "PostgreSQL",
      "Redis",
      "Master / Firebird",
      "Release",
      "Versión API",
      "Migración",
      "Uptime",
      "Sesiones activas",
      "MFA",
    ]) {
      expect(
        screen.queryByText(label, { exact: true }),
      ).not.toBeInTheDocument();
    }
  });

  it("keeps operational risk visible without fabricating unsupported values", async () => {
    renderPage();
    const overdue = await screen.findByText("PQR vencidas por SLA");
    expect(overdue.closest("div.rounded-2xl")).toHaveTextContent("1");
    expect(screen.queryByText("Desconocido")).not.toBeInTheDocument();
  });
});
