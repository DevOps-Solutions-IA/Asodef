import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { CurrentAdminSecurityOverview } from "./CurrentAdminSecurityOverview";
import { buildCurrentUser, mockAuthFetch, renderWithAuth } from "../../test-utils/auth-test-helpers";

function response(status: number, body: unknown): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}

const USER_ID = "admin-user";
const DETAIL = {
  id: USER_ID, email: "admin@asodef.com.co", fullName: "ASODEF Admin", status: "ACTIVE",
  roles: ["SUPER_ADMIN"], permissions: [], createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-08-20T00:00:00.000Z", lastLoginAt: "2026-08-20T10:00:00.000Z",
  lockedUntil: null, isLocked: false, passwordChangedAt: "2026-08-01T00:00:00.000Z", activeSessionCount: 2,
};
const SESSIONS = [
  { id: "current", createdAt: "2026-08-20T10:00:00.000Z", lastUsedAt: null, expiresAt: "2099-01-01T00:00:00.000Z", revokedAt: null, revokedReason: null, ipAddress: "203.0.113.0", userAgent: "Browser A", isActive: true, isCurrent: true },
  { id: "other", createdAt: "2026-08-19T10:00:00.000Z", lastUsedAt: null, expiresAt: "2099-01-01T00:00:00.000Z", revokedAt: null, revokedReason: null, ipAddress: "203.0.113.0", userAgent: "Browser B", isActive: true, isCurrent: false },
];

function renderOverview(extra?: (url: string, init?: RequestInit) => Promise<Response> | undefined) {
  const fetchMock = mockAuthFetch(buildCurrentUser({ id: USER_ID, roles: ["SUPER_ADMIN"] }), (url, init) => {
    const handled = extra?.(url, init);
    if (handled) return handled;
    if (url.endsWith(`/admin/users/${USER_ID}`)) return response(200, DETAIL);
    if (url.endsWith("/admin/users/stats")) return response(200, { totalUsers: 1, activeUsers: 1, inactiveUsers: 0, suspendedUsers: 0, lockedUsers: 0, recentLoginFailures24h: 3, activeSessions: 2 });
    if (url.endsWith(`/admin/users/${USER_ID}/sessions`)) return response(200, SESSIONS);
    if (url.endsWith("/admin/sistema")) return response(200, {
      generatedAt: "2026-08-20T12:00:00.000Z",
      security: { state: "HEALTHY", recoveryChannel: "CONFIGURED", mfaRequired: true },
    });
    return undefined;
  });
  renderWithAuth(<MemoryRouter><CurrentAdminSecurityOverview userId={USER_ID} /></MemoryRouter>);
  return fetchMock;
}

describe("CurrentAdminSecurityOverview", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders only real account, recovery and session state", async () => {
    renderOverview();
    expect(await screen.findByText("Configurado")).toBeInTheDocument();
    expect(screen.getByText("Verificada")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Revocar otras sesiones (1)" })).toBeEnabled();
  });

  it("completes step-up and retries a protected password change exactly once", async () => {
    let changeAttempts = 0;
    const fetchMock = renderOverview((url, init) => {
      if (url.endsWith("/auth/change-password") && init?.method === "POST") {
        changeAttempts += 1;
        return changeAttempts === 1
          ? response(403, { statusCode: 403, code: "STEP_UP_REQUIRED", message: "safe" })
          : response(200, { message: "ok" });
      }
      if (url.endsWith("/auth/step-up") && init?.method === "POST") return response(200, { verifiedAt: "2026-08-20T12:00:00.000Z" });
      return undefined;
    });
    const user = userEvent.setup();
    await screen.findByText("Configurado");
    const passwordCard = screen.getByRole("heading", { name: "Cambiar contraseña" }).closest<HTMLElement>("[aria-labelledby='change-password-heading']");
    expect(passwordCard).not.toBeNull();
    const passwordFields = within(passwordCard!).getAllByLabelText(/contraseña/i, { selector: "input" });
    expect(passwordFields).toHaveLength(3);
    await user.type(passwordFields[0]!, "CurrentPassword!23");
    await user.type(passwordFields[1]!, "NewSecurePassword!45");
    await user.type(passwordFields[2]!, "NewSecurePassword!45");
    await user.click(within(passwordCard!).getByRole("button", { name: "Actualizar contraseña" }));
    const stepUpDialog = await screen.findByRole("dialog", { name: "Confirma tu identidad" });
    await user.type(within(stepUpDialog).getByLabelText("Contraseña actual", { exact: false }), "CurrentPassword!23");
    await user.type(within(stepUpDialog).getByLabelText("Código de verificación", { exact: false }), "123456");
    await user.click(within(stepUpDialog).getByRole("button", { name: "Continuar" }));
    expect(await screen.findByText(/contraseña se actualizó/)).toBeInTheDocument();
    await waitFor(() => expect(changeAttempts).toBe(2));
    expect(fetchMock.mock.calls.filter(([input]) => String(input).endsWith("/auth/step-up"))).toHaveLength(1);
    expect(screen.queryByDisplayValue("CurrentPassword!23")).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue("NewSecurePassword!45")).not.toBeInTheDocument();
  });

  it("cancels password step-up without retrying or exposing an error", async () => {
    let changeAttempts = 0;
    renderOverview((url, init) => {
      if (url.endsWith("/auth/change-password") && init?.method === "POST") {
        changeAttempts += 1;
        return response(403, { statusCode: 403, code: "STEP_UP_REQUIRED", message: "safe" });
      }
      return undefined;
    });
    const user = userEvent.setup();
    await screen.findByText("Configurado");
    const passwordCard = screen.getByRole("heading", { name: "Cambiar contraseña" }).closest<HTMLElement>("[aria-labelledby='change-password-heading']");
    expect(passwordCard).not.toBeNull();
    const passwordFields = within(passwordCard!).getAllByLabelText(/contraseña/i, { selector: "input" });
    expect(passwordFields).toHaveLength(3);
    await user.type(passwordFields[0]!, "CurrentPassword!23");
    await user.type(passwordFields[1]!, "NewSecurePassword!45");
    await user.type(passwordFields[2]!, "NewSecurePassword!45");
    await user.click(within(passwordCard!).getByRole("button", { name: "Actualizar contraseña" }));
    const stepUpDialog = await screen.findByRole("dialog", { name: "Confirma tu identidad" });
    await user.click(within(stepUpDialog).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Confirma tu identidad" })).not.toBeInTheDocument());
    expect(changeAttempts).toBe(1);
    expect(screen.queryByText(/contraseña se actualizó/)).not.toBeInTheDocument();
  });

  it("revokes other sessions with an explicit reason through the existing step-up-aware action", async () => {
    const fetchMock = renderOverview((url, init) => {
      if (url.endsWith("/sessions/revoke") && init?.method === "POST") return response(200, { revokedCount: 1 });
      return undefined;
    });
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Revocar otras sesiones (1)" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Motivo", { exact: false }), "Rotación preventiva de sesiones");
    await user.click(within(dialog).getByRole("button", { name: "Revocar" }));
    expect(await screen.findByText(/demás sesiones activas fueron revocadas/)).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([input]) => String(input).endsWith("/sessions/revoke"))).toBe(true);
  });
});
