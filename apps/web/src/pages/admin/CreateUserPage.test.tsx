import { afterEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { CreateUserPage } from "./CreateUserPage";
import { buildCurrentUser, mockAuthFetch, renderWithAuth } from "../../test-utils/auth-test-helpers";

function jsonResponse(status: number, body: unknown): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}

describe("CreateUserPage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("validates required fields before submitting", async () => {
    const fetchMock = mockAuthFetch(buildCurrentUser({ roles: ["ADMIN"], permissions: ["users.create"] }));
    const user = userEvent.setup();
    renderWithAuth(
      <MemoryRouter initialEntries={["/admin/usuarios/nuevo"]}>
        <CreateUserPage />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("button", { name: "Crear usuario" }));

    expect(await screen.findByText("El correo electrónico es requerido.")).toBeInTheDocument();
    const calls = fetchMock.mock.calls.filter(([input]) => String(input).includes("/admin/users") && !String(input).includes("/auth"));
    expect(calls).toHaveLength(0);
  });

  it("hides the roles field for an ADMIN (not SUPER_ADMIN) and shows an explanatory note", async () => {
    mockAuthFetch(buildCurrentUser({ roles: ["ADMIN"], permissions: ["users.create"] }));
    renderWithAuth(
      <MemoryRouter initialEntries={["/admin/usuarios/nuevo"]}>
        <CreateUserPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText(/Solo un SUPER_ADMIN puede asignar roles/)).toBeInTheDocument();
    expect(screen.queryByText("Roles iniciales (opcional)")).not.toBeInTheDocument();
  });

  it("shows the roles field for a SUPER_ADMIN", async () => {
    mockAuthFetch(buildCurrentUser({ roles: ["SUPER_ADMIN"], permissions: ["users.create"] }));
    renderWithAuth(
      <MemoryRouter initialEntries={["/admin/usuarios/nuevo"]}>
        <CreateUserPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Roles iniciales (opcional)")).toBeInTheDocument();
    expect(screen.getByLabelText("FINANCE")).toBeInTheDocument();
  });

  it("shows a safe duplicate-email message on 409", async () => {
    mockAuthFetch(buildCurrentUser({ roles: ["ADMIN"], permissions: ["users.create"] }), (url) => {
      if (url.endsWith("/admin/users")) {
        return jsonResponse(409, {
          statusCode: 409,
          error: "Conflict",
          message: "Ya existe un usuario con este correo electrónico.",
        });
      }
      return undefined;
    });
    const user = userEvent.setup();
    renderWithAuth(
      <MemoryRouter initialEntries={["/admin/usuarios/nuevo"]}>
        <CreateUserPage />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText("Correo electrónico", { exact: false }), "existing@asodef.test");
    await user.type(screen.getByLabelText("Nombre completo", { exact: false }), "Existing User");
    await user.click(screen.getByRole("button", { name: "Crear usuario" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Ya existe un usuario con este correo electrónico.");
  });

  it("navigates to the new user's detail page on success", async () => {
    mockAuthFetch(buildCurrentUser({ roles: ["ADMIN"], permissions: ["users.create"] }), (url) => {
      if (url.endsWith("/admin/users")) {
        return jsonResponse(201, {
          id: "new-user-id",
          email: "brand-new@asodef.test",
          fullName: "Brand New",
          status: "ACTIVE",
          roles: [],
          createdAt: "2026-01-01T00:00:00.000Z",
          lastLoginAt: null,
        });
      }
      return undefined;
    });
    const user = userEvent.setup();
    renderWithAuth(
      <MemoryRouter initialEntries={["/admin/usuarios/nuevo"]}>
        <Routes>
          <Route path="/admin/usuarios/nuevo" element={<CreateUserPage />} />
          <Route path="/admin/usuarios/:userId" element={<div>Detalle de usuario</div>} />
        </Routes>
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText("Correo electrónico", { exact: false }), "brand-new@asodef.test");
    await user.type(screen.getByLabelText("Nombre completo", { exact: false }), "Brand New");
    await user.click(screen.getByRole("button", { name: "Crear usuario" }));

    expect(await screen.findByText("Detalle de usuario")).toBeInTheDocument();
  });
});
