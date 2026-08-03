import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { UserListPage } from "./UserListPage";
import { buildCurrentUser, mockAuthFetch, renderWithAuth } from "../../test-utils/auth-test-helpers";

function jsonResponse(status: number, body: unknown): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}

function buildUserRow(overrides: Partial<{ id: string; email: string; fullName: string; status: string; roles: string[] }> = {}) {
  return {
    id: overrides.id ?? "user-1",
    email: overrides.email ?? "someone@asodef.test",
    fullName: overrides.fullName ?? "Someone Example",
    status: overrides.status ?? "ACTIVE",
    roles: overrides.roles ?? ["CUSTOMER"],
    createdAt: "2026-01-01T00:00:00.000Z",
    lastLoginAt: null,
  };
}

function renderList(additionalHandlers: (url: string, init: RequestInit | undefined) => Promise<Response> | undefined) {
  mockAuthFetch(buildCurrentUser({ roles: ["ADMIN"], permissions: ["users.read", "users.create"] }), additionalHandlers);
  return renderWithAuth(
    <MemoryRouter initialEntries={["/admin/usuarios"]}>
      <UserListPage />
    </MemoryRouter>,
  );
}

describe("UserListPage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows a loading state, then the list of users", async () => {
    renderList((url) => {
      if (url.includes("/admin/users")) {
        return jsonResponse(200, { items: [buildUserRow()], total: 1, page: 1, pageSize: 20 });
      }
      return undefined;
    });

    expect(await screen.findByText("Someone Example")).toBeInTheDocument();
    expect(screen.getByText("someone@asodef.test")).toBeInTheDocument();
  });

  it("shows an accessible empty state when there are no matching users", async () => {
    renderList((url) => {
      if (url.includes("/admin/users")) {
        return jsonResponse(200, { items: [], total: 0, page: 1, pageSize: 20 });
      }
      return undefined;
    });

    expect(await screen.findByText("No hay usuarios que coincidan")).toBeInTheDocument();
  });

  it("shows a safe error state and allows retrying on failure", async () => {
    let callCount = 0;
    renderList((url) => {
      if (url.includes("/admin/users")) {
        callCount += 1;
        if (callCount === 1) return jsonResponse(500, { statusCode: 500, error: "Internal Server Error", message: "db exploded" });
        return jsonResponse(200, { items: [buildUserRow()], total: 1, page: 1, pageSize: 20 });
      }
      return undefined;
    });

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).not.toMatch(/db exploded/i);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("Someone Example")).toBeInTheDocument();
  });

  it("re-fetches with the search term as a query parameter", async () => {
    const fetchMock = mockAuthFetch(buildCurrentUser({ roles: ["ADMIN"], permissions: ["users.read"] }), (url) => {
      if (url.includes("/admin/users")) {
        return jsonResponse(200, { items: [buildUserRow()], total: 1, page: 1, pageSize: 20 });
      }
      return undefined;
    });
    renderWithAuth(
      <MemoryRouter initialEntries={["/admin/usuarios"]}>
        <UserListPage />
      </MemoryRouter>,
    );
    await screen.findByText("Someone Example");

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Buscar"), "maria");

    await waitFor(() => {
      const calls = fetchMock.mock.calls.filter(([input]) => String(input).includes("/admin/users?"));
      expect(calls.some(([input]) => String(input).includes("search=maria"))).toBe(true);
    });
  });

  it("re-fetches with the status filter as a query parameter", async () => {
    const fetchMock = mockAuthFetch(buildCurrentUser({ roles: ["ADMIN"], permissions: ["users.read"] }), (url) => {
      if (url.includes("/admin/users")) {
        return jsonResponse(200, { items: [buildUserRow()], total: 1, page: 1, pageSize: 20 });
      }
      return undefined;
    });
    renderWithAuth(
      <MemoryRouter initialEntries={["/admin/usuarios"]}>
        <UserListPage />
      </MemoryRouter>,
    );
    await screen.findByText("Someone Example");

    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText("Estado"), "INACTIVE");

    await waitFor(() => {
      const calls = fetchMock.mock.calls.filter(([input]) => String(input).includes("/admin/users?"));
      expect(calls.some(([input]) => String(input).includes("status=INACTIVE"))).toBe(true);
    });
  });

  it("shows pagination controls reflecting the total result count", async () => {
    renderList((url) => {
      if (url.includes("/admin/users")) {
        return jsonResponse(200, { items: [buildUserRow()], total: 45, page: 1, pageSize: 20 });
      }
      return undefined;
    });

    await screen.findByText("Someone Example");
    expect(screen.getByText("1–20 de 45")).toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: "Paginación" });
    expect(within(nav).getByRole("button", { name: "Anterior" })).toBeDisabled();
    expect(within(nav).getByRole("button", { name: "Siguiente" })).not.toBeDisabled();
  });

  it("does not show the 'Nuevo usuario' action for an actor without users.create", async () => {
    mockAuthFetch(buildCurrentUser({ roles: ["ADMIN"], permissions: ["users.read"] }), (url) => {
      if (url.includes("/admin/users")) {
        return jsonResponse(200, { items: [buildUserRow()], total: 1, page: 1, pageSize: 20 });
      }
      return undefined;
    });
    renderWithAuth(
      <MemoryRouter initialEntries={["/admin/usuarios"]}>
        <UserListPage />
      </MemoryRouter>,
    );

    await screen.findByText("Someone Example");
    expect(screen.queryByRole("link", { name: /Nuevo usuario/ })).not.toBeInTheDocument();
  });
});
