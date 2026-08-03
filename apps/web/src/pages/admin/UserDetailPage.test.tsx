import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { UserDetailPage } from "./UserDetailPage";
import { buildCurrentUser, mockAuthFetch, renderWithAuth } from "../../test-utils/auth-test-helpers";

function jsonResponse(status: number, body: unknown): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}

function buildDetail(overrides: Partial<{ status: string; isLocked: boolean; activeSessionCount: number }> = {}) {
  return {
    id: "target-user",
    email: "target@asodef.test",
    fullName: "Target User",
    status: overrides.status ?? "ACTIVE",
    roles: ["CUSTOMER"],
    permissions: ["payments.read"],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    lastLoginAt: null,
    lockedUntil: overrides.isLocked ? "2099-01-01T00:00:00.000Z" : null,
    isLocked: overrides.isLocked ?? false,
    passwordChangedAt: null,
    activeSessionCount: overrides.activeSessionCount ?? 0,
  };
}

function renderDetail(permissions: string[], detail: ReturnType<typeof buildDetail>, additionalPatch?: (url: string, init: RequestInit | undefined) => Promise<Response> | undefined) {
  const fetchMock = mockAuthFetch(buildCurrentUser({ roles: ["ADMIN"], permissions }), (url, init) => {
    const patched = additionalPatch?.(url, init);
    if (patched) return patched;
    if (url.endsWith(`/admin/users/${detail.id}`) && (!init || init.method === undefined || init.method === "GET")) {
      return jsonResponse(200, detail);
    }
    return undefined;
  });
  renderWithAuth(
    <MemoryRouter initialEntries={[`/admin/usuarios/${detail.id}`]}>
      <Routes>
        <Route path="/admin/usuarios/:userId" element={<UserDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
  return fetchMock;
}

describe("UserDetailPage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows profile and security summary once loaded", async () => {
    renderDetail(["users.read"], buildDetail());
    expect(await screen.findByText("Target User")).toBeInTheDocument();
    expect(screen.getByText("target@asodef.test")).toBeInTheDocument();
  });

  it("requires a reason and confirms before deactivating", async () => {
    const detail = buildDetail({ status: "ACTIVE" });
    const fetchMock = renderDetail(["users.read", "users.deactivate"], detail, (url) => {
      if (url.includes("/deactivate")) {
        return jsonResponse(200, { ...detail, status: "INACTIVE" });
      }
      return undefined;
    });
    const user = userEvent.setup();

    await screen.findByText("Target User");
    await user.click(screen.getByRole("button", { name: "Desactivar" }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Desactivar usuario");

    // Confirming without a reason shows a validation error and does not submit.
    await user.click(within(dialog).getByRole("button", { name: "Desactivar" }));
    expect(await screen.findByText("Debes indicar un motivo para esta acción.")).toBeInTheDocument();

    await user.type(within(dialog).getByLabelText("Motivo", { exact: false, selector: "textarea" }), "employee left the company");
    await user.click(within(dialog).getByRole("button", { name: "Desactivar" }));

    await waitFor(() => {
      const calls = fetchMock.mock.calls.filter(([input]) => String(input).includes("/deactivate"));
      expect(calls).toHaveLength(1);
    });
  });

  it("shows a reactivate button for an inactive user and an unlock button for a locked user", async () => {
    renderDetail(["users.read", "users.reactivate", "users.unlock"], buildDetail({ status: "INACTIVE", isLocked: true }));
    expect(await screen.findByRole("button", { name: "Reactivar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Desbloquear" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Desactivar" })).not.toBeInTheDocument();
  });

  it("does not show any lifecycle action without the matching permission", async () => {
    renderDetail(["users.read"], buildDetail({ status: "INACTIVE", isLocked: true }));
    await screen.findByText("Target User");
    expect(screen.queryByRole("button", { name: "Reactivar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Desbloquear" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Desactivar" })).not.toBeInTheDocument();
  });
});
