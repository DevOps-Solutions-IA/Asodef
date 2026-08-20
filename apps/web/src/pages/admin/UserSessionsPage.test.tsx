import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { UserSessionsPage } from "./UserSessionsPage";
import { buildCurrentUser, mockAuthFetch, renderWithAuth } from "../../test-utils/auth-test-helpers";

function jsonResponse(status: number, body: unknown): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}

const USER_DETAIL = {
  id: "target-user",
  email: "target@asodef.test",
  fullName: "Target User",
  status: "ACTIVE",
  roles: [],
  permissions: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  lastLoginAt: null,
  lockedUntil: null,
  isLocked: false,
  passwordChangedAt: null,
  activeSessionCount: 1,
};

const SESSIONS = [
  {
    id: "session-1",
    createdAt: "2026-01-01T00:00:00.000Z",
    lastUsedAt: "2026-01-02T00:00:00.000Z",
    expiresAt: "2099-01-01T00:00:00.000Z",
    revokedAt: null,
    revokedReason: null,
    ipAddress: "203.0.113.0",
    userAgent: "Test Agent",
    isActive: true,
    isCurrent: false,
  },
];

function renderSessionsPage(additionalPatch?: (url: string, init: RequestInit | undefined) => Promise<Response> | undefined) {
  const fetchMock = mockAuthFetch(buildCurrentUser({ roles: ["ADMIN"], permissions: ["users.sessions.read", "users.sessions.revoke"] }), (url, init) => {
    const patched = additionalPatch?.(url, init);
    if (patched) return patched;
    if (url.endsWith(`/admin/users/${USER_DETAIL.id}`)) return jsonResponse(200, USER_DETAIL);
    if (url.endsWith(`/admin/users/${USER_DETAIL.id}/sessions`) && (!init?.method || init.method === "GET")) {
      return jsonResponse(200, SESSIONS);
    }
    return undefined;
  });
  renderWithAuth(
    <MemoryRouter initialEntries={[`/admin/usuarios/${USER_DETAIL.id}/sesiones`]}>
      <Routes>
        <Route path="/admin/usuarios/:userId/sesiones" element={<UserSessionsPage />} />
      </Routes>
    </MemoryRouter>,
  );
  return fetchMock;
}

describe("UserSessionsPage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("lists sessions with masked IPs, no raw token data", async () => {
    renderSessionsPage();
    expect(await screen.findByText("203.0.113.0")).toBeInTheDocument();
    expect(screen.getByText("Activa")).toBeInTheDocument();
    expect(screen.getByText("session-1")).toBeInTheDocument();
    expect(screen.getByText("Test Agent")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Expira" })).toBeInTheDocument();
    expect(screen.queryByText(/refresh/i)).not.toBeInTheDocument();
  });

  it("shows an empty state with no sessions", async () => {
    renderSessionsPage((url, init) => {
      if (url.endsWith("/sessions") && (!init?.method || init.method === "GET")) return jsonResponse(200, []);
      return undefined;
    });
    expect(await screen.findByText("Sin sesiones registradas")).toBeInTheDocument();
  });

  it("revokes a single session after confirming with a reason", async () => {
    const fetchMock = renderSessionsPage((url, init) => {
      if (url.endsWith("/sessions/revoke") && init?.method === "POST") {
        return jsonResponse(200, { revokedCount: 1 });
      }
      return undefined;
    });
    const user = userEvent.setup();

    await screen.findByText("203.0.113.0");
    await user.click(screen.getByRole("button", { name: "Revocar" }));

    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Motivo", { exact: false, selector: "textarea" }), "suspicious activity");
    await user.click(within(dialog).getByRole("button", { name: "Revocar" }));

    await waitFor(() => {
      const calls = fetchMock.mock.calls.filter(([input]) => String(input).endsWith("/sessions/revoke"));
      expect(calls).toHaveLength(1);
    });
  });

  it("shows 'revoke all' only when there is at least one active session", async () => {
    renderSessionsPage((url, init) => {
      if (url.endsWith("/sessions") && (!init?.method || init.method === "GET")) {
        return jsonResponse(200, [{ ...SESSIONS[0], isActive: false, revokedAt: "2026-01-03T00:00:00.000Z" }]);
      }
      return undefined;
    });

    await screen.findByText("203.0.113.0");
    expect(screen.queryByRole("button", { name: "Revocar todas" })).not.toBeInTheDocument();
  });
});
