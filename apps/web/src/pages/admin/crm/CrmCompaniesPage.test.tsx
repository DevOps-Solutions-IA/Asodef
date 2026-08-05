import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { CrmCompaniesPage } from "./CrmCompaniesPage";
import { buildCurrentUser, mockAuthFetch, renderWithAuth } from "../../../test-utils/auth-test-helpers";

function jsonResponse(status: number, body: unknown): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}

function renderPage(currentUser: ReturnType<typeof buildCurrentUser>, additionalHandlers: (url: string, init: RequestInit | undefined) => Promise<Response> | undefined) {
  mockAuthFetch(currentUser, additionalHandlers);
  return renderWithAuth(
    <MemoryRouter initialEntries={["/admin/crm/empresas"]}>
      <CrmCompaniesPage />
    </MemoryRouter>,
  );
}

describe("CrmCompaniesPage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("hides the Nueva empresa action for an actor without companies.manage", async () => {
    renderPage(buildCurrentUser({ roles: ["COMPANY_PARTNER"], permissions: ["companies.read"] }), (url) => {
      if (url.includes("/admin/companies")) return jsonResponse(200, []);
      if (url.includes("/admin/partners")) return jsonResponse(200, []);
      return undefined;
    });

    await screen.findByText("No hay empresas registradas");
    expect(screen.queryByRole("button", { name: "Nueva empresa" })).not.toBeInTheDocument();
  });

  it("US-075: creates a company through the dialog and refreshes the list", async () => {
    let createCalled = false;
    let listCallCount = 0;
    renderPage(buildCurrentUser({ roles: ["COMMERCIAL"], permissions: ["companies.read", "companies.manage"] }), (url, init) => {
      if (url.includes("/admin/companies") && init?.method === "POST") {
        createCalled = true;
        return jsonResponse(201, {
          id: "company-1",
          name: "Nueva Empresa S.A.S.",
          nit: "9005551234",
          contactName: "Ana Pérez",
          contactEmail: "ana@example.com",
          sector: "Servicios",
          status: "ACTIVE",
          createdAt: "2026-01-01T00:00:00.000Z",
        });
      }
      if (url.includes("/admin/companies")) {
        listCallCount += 1;
        return jsonResponse(200, listCallCount > 1 ? [{ id: "company-1", name: "Nueva Empresa S.A.S.", nit: "9005551234", contactName: "Ana Pérez", contactEmail: "ana@example.com", sector: "Servicios", status: "ACTIVE", createdAt: "2026-01-01T00:00:00.000Z" }] : []);
      }
      if (url.includes("/admin/partners")) return jsonResponse(200, []);
      return undefined;
    });

    const user = userEvent.setup();
    await screen.findByText("No hay empresas registradas");

    await user.click(screen.getByRole("button", { name: "Nueva empresa" }));
    await screen.findByRole("dialog");

    await user.type(screen.getByLabelText("Razón social", { exact: false }), "Nueva Empresa S.A.S.");
    await user.type(screen.getByLabelText("NIT", { exact: false }), "900.555.1234");
    await user.type(screen.getByLabelText("Nombre de contacto", { exact: false }), "Ana Pérez");
    await user.type(screen.getByLabelText("Correo de contacto", { exact: false }), "ana@example.com");
    await user.type(screen.getByLabelText("Sector", { exact: false }), "Servicios");

    await user.click(screen.getByRole("button", { name: "Crear empresa" }));

    await waitFor(() => expect(createCalled).toBe(true));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(await screen.findByText("Nueva Empresa S.A.S.")).toBeInTheDocument();
  });

  it("Negative case (AC): a duplicate-NIT 409 shows the server's message without closing the dialog", async () => {
    renderPage(buildCurrentUser({ roles: ["COMMERCIAL"], permissions: ["companies.read", "companies.manage"] }), (url, init) => {
      if (url.includes("/admin/companies") && init?.method === "POST") {
        return jsonResponse(409, { statusCode: 409, error: "Conflict", message: "Ya existe una empresa registrada con el NIT 9005551234." });
      }
      if (url.includes("/admin/companies")) return jsonResponse(200, []);
      if (url.includes("/admin/partners")) return jsonResponse(200, []);
      return undefined;
    });

    const user = userEvent.setup();
    await screen.findByText("No hay empresas registradas");
    await user.click(screen.getByRole("button", { name: "Nueva empresa" }));
    await screen.findByRole("dialog");

    await user.type(screen.getByLabelText("Razón social", { exact: false }), "Empresa Duplicada");
    await user.type(screen.getByLabelText("NIT", { exact: false }), "9005551234");
    await user.type(screen.getByLabelText("Nombre de contacto", { exact: false }), "Ana Pérez");
    await user.type(screen.getByLabelText("Correo de contacto", { exact: false }), "ana@example.com");
    await user.type(screen.getByLabelText("Sector", { exact: false }), "Servicios");
    await user.click(screen.getByRole("button", { name: "Crear empresa" }));

    expect(await screen.findByText("Ya existe una empresa registrada con el NIT 9005551234.")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
