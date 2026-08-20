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
    const forbiddenCalls: string[] = [];
    renderPage(buildCurrentUser({ roles: ["FINANCE"], permissions: ["payments.read"] }), (url) => {
      if (
        url.includes("/admin/users/stats")
        || url.includes("/admin/users/user-1")
        || url.includes("/admin/sistema")
        || url.includes("/auth/mfa/status")
      ) {
        forbiddenCalls.push(url);
        return jsonResponse(403, { statusCode: 403, error: "Forbidden", message: "No autorizado." });
      }
      if (url.includes("/admin/dashboard")) return jsonResponse(200, buildDashboard());
      return undefined;
    });

    await screen.findByText("7");
    expect(forbiddenCalls).toEqual([]);
    expect(screen.queryByText("Cuentas de usuario")).not.toBeInTheDocument();
    expect(screen.getAllByText("Desconocido").length).toBeGreaterThan(0);
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

  it("renders the operational control-plane core from authorized live contracts", async () => {
    const called: string[] = [];
    renderPage(
      buildCurrentUser({
        roles: ["SUPER_ADMIN"],
        permissions: ["settings.manage", "users.read", "users.sessions.read", "payments.read"],
      }),
      (url) => {
        called.push(url);
        if (url.includes("/admin/dashboard")) return jsonResponse(200, buildDashboard());
        if (url.includes("/admin/sistema")) {
          return jsonResponse(200, {
            generatedAt: "2026-08-20T12:00:00.000Z",
            api: {
              status: "AVAILABLE",
              uptimeSeconds: 7_560,
              releaseSha: "release-abc123",
              version: "1.2.3",
              migrationVersion: "20260819133000_add_structured_audit_context",
            },
            dependencies: {
              postgres: { status: "AVAILABLE", latencyMs: 3 },
              redis: { status: "UNAVAILABLE", latencyMs: 3_000 },
              master: { status: "NOT_CONFIGURED", latencyMs: 0 },
            },
            notifications: { status: "AVAILABLE", backlog: 4, failed: 1, deadLetter: 0 },
          });
        }
        if (url.includes("/admin/users/stats")) {
          return jsonResponse(200, {
            totalUsers: 1,
            activeUsers: 1,
            inactiveUsers: 0,
            suspendedUsers: 0,
            lockedUsers: 1,
            recentLoginFailures24h: 2,
            activeSessions: 2,
          });
        }
        if (url.includes("/admin/users/user-1/sessions")) {
          return jsonResponse(200, [
            { id: "current", createdAt: "2026-08-20T10:00:00.000Z", lastUsedAt: null, expiresAt: "2026-08-21T10:00:00.000Z", revokedAt: null, revokedReason: null, ipAddress: null, userAgent: null, isActive: true, isCurrent: true },
            { id: "old", createdAt: "2026-08-18T10:00:00.000Z", lastUsedAt: null, expiresAt: "2026-08-19T10:00:00.000Z", revokedAt: "2026-08-18T11:00:00.000Z", revokedReason: "ADMIN_ACTION", ipAddress: null, userAgent: null, isActive: false, isCurrent: false },
          ]);
        }
        if (url.includes("/admin/users/user-1")) {
          return jsonResponse(200, {
            id: "user-1",
            email: "admin@asodef.com.co",
            fullName: "Admin",
            status: "ACTIVE",
            roles: ["SUPER_ADMIN"],
            permissions: [],
            createdAt: "2026-01-01T00:00:00.000Z",
            lastLoginAt: "2026-08-20T10:00:00.000Z",
            updatedAt: "2026-08-20T10:00:00.000Z",
            lockedUntil: null,
            isLocked: false,
            passwordChangedAt: "2026-08-10T10:00:00.000Z",
            activeSessionCount: 1,
          });
        }
        if (url.includes("/auth/mfa/status")) {
          return jsonResponse(200, { required: true, enrolled: true, status: "ACTIVE", confirmedAt: "2026-08-19T12:00:00.000Z", recoveryCodesRemaining: 8 });
        }
        return undefined;
      },
    );

    expect(await screen.findByRole("heading", { name: "Sistema" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Seguridad" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Operación" })).toBeInTheDocument();
    expect(await screen.findByText("release-abc123")).toBeInTheDocument();
    expect(screen.getByText("Activo")).toBeInTheDocument();
    expect(screen.getAllByText("No configurado").length).toBeGreaterThan(0);
    expect(screen.getAllByText("1").length).toBeGreaterThan(0);
    expect(called.some((url) => url.includes("/admin/sistema"))).toBe(true);
    expect(called.some((url) => url.includes("/auth/mfa/status"))).toBe(true);
  });
});
