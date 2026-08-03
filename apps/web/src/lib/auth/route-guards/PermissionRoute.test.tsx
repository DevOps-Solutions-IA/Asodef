import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { PermissionRoute } from "./PermissionRoute";
import { buildCurrentUser, mockAuthFetch, renderWithAuth } from "../../../test-utils/auth-test-helpers";

function renderProtected(permissions: string[], initialPath = "/reportes") {
  return renderWithAuth(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route element={<PermissionRoute permissions={permissions} />}>
          <Route path="/reportes" element={<div>Contenido de reportes</div>} />
        </Route>
        <Route path="/iniciar-sesion" element={<div>Contenido de inicio de sesión</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("PermissionRoute", () => {
  it("redirects an unauthenticated visitor to /iniciar-sesion", async () => {
    mockAuthFetch(null);
    renderProtected(["reports:read"]);

    expect(await screen.findByText("Contenido de inicio de sesión")).toBeInTheDocument();
  });

  it("renders ForbiddenPage in place when the user lacks a required permission", async () => {
    mockAuthFetch(buildCurrentUser({ roles: ["CUSTOMER"], permissions: ["profile:read"] }));
    renderProtected(["reports:read"]);

    expect(await screen.findByText("No tienes permisos para ver esta página")).toBeInTheDocument();
    expect(screen.queryByText("Contenido de reportes")).not.toBeInTheDocument();
  });

  it("renders ForbiddenPage when the user has only some, but not all, of the required permissions", async () => {
    mockAuthFetch(buildCurrentUser({ roles: ["ADMIN"], permissions: ["reports:read"] }));
    renderProtected(["reports:read", "reports:export"]);

    expect(await screen.findByText("No tienes permisos para ver esta página")).toBeInTheDocument();
  });

  it("does not grant access purely from a role name when explicit permissions are required", async () => {
    // US-010 section 8: never infer permissions from role names - an
    // ADMIN role alone must not satisfy a permission-gated route.
    mockAuthFetch(buildCurrentUser({ roles: ["ADMIN"], permissions: [] }));
    renderProtected(["reports:read"]);

    expect(await screen.findByText("No tienes permisos para ver esta página")).toBeInTheDocument();
  });

  it("renders the protected content when the user holds every required permission", async () => {
    mockAuthFetch(buildCurrentUser({ roles: ["ADMIN"], permissions: ["reports:read", "reports:export"] }));
    renderProtected(["reports:read", "reports:export"]);

    expect(await screen.findByText("Contenido de reportes")).toBeInTheDocument();
  });
});
