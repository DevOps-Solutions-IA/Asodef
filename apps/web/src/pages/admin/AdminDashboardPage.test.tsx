import { afterEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AdminDashboardPage } from "./AdminDashboardPage";
import { buildCurrentUser, mockAuthFetch, renderWithAuth } from "../../test-utils/auth-test-helpers";

function jsonResponse(status: number, body: unknown): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}

function buildDashboard(overrides: Partial<{ obligacionesPendientes: number }> = {}) {
  return {
    newProspects30d: 3,
    opportunitiesByStage: { NEW_PROSPECT: 2, ACTIVE_PARTNER: 1 },
    conversionRate: 0.25,
    activeCompanies: 4,
    activeAgreements: 2,
    contractsPendingSignature: 1,
    contractsNearingExpiration: 0,
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
    obligacionesPendientes: overrides.obligacionesPendientes ?? 7,
    obligacionesVencidas: 2,
    reconciliationDifferencesOpen: 1,
  };
}

function renderPage(currentUser: ReturnType<typeof buildCurrentUser>, additionalHandlers: (url: string, init: RequestInit | undefined) => Promise<Response> | undefined) {
  mockAuthFetch(currentUser, additionalHandlers);
  return renderWithAuth(
    <MemoryRouter initialEntries={["/admin"]}>
      <AdminDashboardPage />
    </MemoryRouter>,
  );
}

describe("AdminDashboardPage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("US-064 AC1: shows real business metrics computed from the dashboard endpoint", async () => {
    renderPage(buildCurrentUser({ roles: ["FINANCE"], permissions: ["payments.read"] }), (url) => {
      if (url.includes("/admin/dashboard")) return jsonResponse(200, buildDashboard());
      return undefined;
    });

    expect(await screen.findByText("7")).toBeInTheDocument();
    expect(screen.getByText("$ 30.000")).toBeInTheDocument();
  });

  it("does not query or render user-account stats for an actor without users.read (regression: this used to error for every non-ADMIN role)", async () => {
    let userStatsCalled = false;
    renderPage(buildCurrentUser({ roles: ["FINANCE"], permissions: ["payments.read"] }), (url) => {
      if (url.includes("/admin/users/stats")) {
        userStatsCalled = true;
        return jsonResponse(403, { statusCode: 403, error: "Forbidden", message: "No autorizado." });
      }
      if (url.includes("/admin/dashboard")) return jsonResponse(200, buildDashboard());
      return undefined;
    });

    await screen.findByText("7");
    expect(userStatsCalled).toBe(false);
    expect(screen.queryByText("Cuentas de usuario")).not.toBeInTheDocument();
  });

  it("shows user-account stats for an actor with users.read", async () => {
    renderPage(buildCurrentUser({ roles: ["ADMIN"], permissions: ["users.read"] }), (url) => {
      if (url.includes("/admin/dashboard")) return jsonResponse(200, buildDashboard());
      if (url.includes("/admin/users/stats")) {
        return jsonResponse(200, {
          totalUsers: 12,
          activeUsers: 10,
          inactiveUsers: 1,
          suspendedUsers: 1,
          lockedUsers: 0,
          recentLoginFailures24h: 0,
          activeSessions: 5,
        });
      }
      return undefined;
    });

    // MetricCard wraps the label together with its optional attention
    // icon in an inner flex row, so the value "12" is a sibling of that
    // wrapper (not of the label itself) - assert on the shared card
    // container rather than raw DOM adjacency.
    const label = await screen.findByText("Usuarios totales");
    const card = label.parentElement?.parentElement;
    expect(card).toHaveTextContent("12");
  });
});
