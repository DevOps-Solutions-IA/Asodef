import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { UserRolesPage } from "./UserRolesPage";
import { buildCurrentUser, mockAuthFetch, renderWithAuth } from "../../test-utils/auth-test-helpers";

function jsonResponse(status: number, body: unknown): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}

const USER_DETAIL = {
  id: "target-user",
  email: "target@asodef.test",
  fullName: "Target User",
  status: "ACTIVE",
  roles: ["FINANCE"],
  permissions: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  lastLoginAt: null,
  lockedUntil: null,
  isLocked: false,
  passwordChangedAt: null,
  activeSessionCount: 0,
};

function renderRolesPage(additionalPatch?: (url: string, init: RequestInit | undefined) => Promise<Response> | undefined) {
  const fetchMock = mockAuthFetch(buildCurrentUser({ roles: ["SUPER_ADMIN"], permissions: ["users.roles.manage"] }), (url, init) => {
    const patched = additionalPatch?.(url, init);
    if (patched) return patched;
    if (url.endsWith(`/admin/users/${USER_DETAIL.id}`)) return jsonResponse(200, USER_DETAIL);
    if (url.endsWith(`/admin/users/${USER_DETAIL.id}/roles`) && (!init?.method || init.method === "GET")) {
      return jsonResponse(200, { assigned: ["FINANCE"], available: ["SUPER_ADMIN", "ADMIN", "FINANCE", "AUDITOR"] });
    }
    return undefined;
  });
  renderWithAuth(
    <MemoryRouter initialEntries={[`/admin/usuarios/${USER_DETAIL.id}/roles`]}>
      <Routes>
        <Route path="/admin/usuarios/:userId/roles" element={<UserRolesPage />} />
      </Routes>
    </MemoryRouter>,
  );
  return fetchMock;
}

describe("UserRolesPage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows assigned vs. available roles", async () => {
    renderRolesPage();
    expect(await screen.findByText("SUPER_ADMIN")).toBeInTheDocument();
    const financeRow = screen.getByText("FINANCE").closest("tr")!;
    expect(within(financeRow).getByText("Asignado")).toBeInTheDocument();
    const adminRow = screen.getByText("ADMIN").closest("tr")!;
    expect(within(adminRow).getByText("No asignado")).toBeInTheDocument();
  });

  it("assigns a role after confirming with a reason", async () => {
    const fetchMock = renderRolesPage((url, init) => {
      if (url.endsWith("/roles") && init?.method === "POST") {
        return jsonResponse(200, { applied: true });
      }
      return undefined;
    });
    const user = userEvent.setup();

    await screen.findByText("ADMIN");
    const adminRow = screen.getByText("ADMIN").closest("tr")!;
    await user.click(within(adminRow).getByRole("button", { name: "Asignar" }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Asignar rol ADMIN");
    await user.type(within(dialog).getByLabelText("Motivo", { exact: false, selector: "textarea" }), "promoted to admin");
    await user.click(within(dialog).getByRole("button", { name: "Asignar" }));

    await waitFor(() => {
      const calls = fetchMock.mock.calls.filter(([input, init]) => String(input).endsWith("/roles") && (init as RequestInit)?.method === "POST");
      expect(calls).toHaveLength(1);
    });
  });

  it("revokes a role after confirming with a reason", async () => {
    const fetchMock = renderRolesPage((url, init) => {
      if (url.endsWith("/roles/revoke") && init?.method === "POST") {
        return jsonResponse(200, { applied: true });
      }
      return undefined;
    });
    const user = userEvent.setup();

    await screen.findByText("FINANCE");
    const financeRow = screen.getByText("FINANCE").closest("tr")!;
    await user.click(within(financeRow).getByRole("button", { name: "Revocar" }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Revocar rol FINANCE");
    await user.type(within(dialog).getByLabelText("Motivo", { exact: false, selector: "textarea" }), "no longer needed");
    await user.click(within(dialog).getByRole("button", { name: "Revocar" }));

    await waitFor(() => {
      const calls = fetchMock.mock.calls.filter(([input]) => String(input).endsWith("/roles/revoke"));
      expect(calls).toHaveLength(1);
    });
  });
});
