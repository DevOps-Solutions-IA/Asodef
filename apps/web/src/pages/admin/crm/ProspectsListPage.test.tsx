import { afterEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ProspectsListPage } from "./ProspectsListPage";
import { buildCurrentUser, mockAuthFetch, renderWithAuth } from "../../../test-utils/auth-test-helpers";

function jsonResponse(status: number, body: unknown): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}

function buildProspect(overrides: Partial<{ id: string; fullNameOrLegalName: string; documentOrNit: string; stage: string }> = {}) {
  return {
    id: overrides.id ?? "prospect-1",
    type: "COMPANY",
    fullNameOrLegalName: overrides.fullNameOrLegalName ?? "Empresa Prospecto S.A.S.",
    documentOrNit: overrides.documentOrNit ?? "900111222",
    sector: "Servicios",
    city: "Cali",
    source: null,
    assignedUserId: null,
    stage: overrides.stage ?? "NEW_PROSPECT",
    estimatedValueCents: null,
    probability: null,
    expectedClosingDate: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function buildLead(overrides: Partial<{ id: string; fullName: string; prospectId: string | null }> = {}) {
  return {
    id: overrides.id ?? "lead-1",
    fullName: overrides.fullName ?? "Contacto de Prueba",
    company: "Empresa Lead S.A.S.",
    position: "Gerente",
    city: "Cali",
    phone: "3000000000",
    email: "lead@example.com",
    sector: "Servicios",
    message: "Interesado.",
    status: "PENDING",
    prospectId: overrides.prospectId ?? null,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function renderPage(currentUser: ReturnType<typeof buildCurrentUser>, additionalHandlers: (url: string, init: RequestInit | undefined) => Promise<Response> | undefined) {
  mockAuthFetch(currentUser, additionalHandlers);
  return renderWithAuth(
    <MemoryRouter initialEntries={["/admin/crm/prospectos"]}>
      <ProspectsListPage />
    </MemoryRouter>,
  );
}

describe("ProspectsListPage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("lists both Prospects and LeadSubmissions (AC1)", async () => {
    renderPage(buildCurrentUser({ roles: ["COMMERCIAL"], permissions: ["crm.manage"] }), (url) => {
      if (url.includes("/admin/prospects")) return jsonResponse(200, [buildProspect()]);
      if (url.includes("/admin/leads")) return jsonResponse(200, [buildLead()]);
      return undefined;
    });

    expect(await screen.findByText("Empresa Prospecto S.A.S.")).toBeInTheDocument();
    expect(await screen.findByText("Contacto de Prueba")).toBeInTheDocument();
  });

  it("shows a 'Promovido' badge instead of the promote action for an already-promoted lead", async () => {
    renderPage(buildCurrentUser({ roles: ["COMMERCIAL"], permissions: ["crm.manage"] }), (url) => {
      if (url.includes("/admin/prospects")) return jsonResponse(200, []);
      if (url.includes("/admin/leads")) return jsonResponse(200, [buildLead({ prospectId: "prospect-1" })]);
      return undefined;
    });

    expect(await screen.findByText("Promovido")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Promover a prospecto" })).not.toBeInTheDocument();
  });

  it("Negative case (AC): an actor without crm.manage sees the promote action disabled", async () => {
    renderPage(buildCurrentUser({ roles: ["FINANCE"], permissions: ["payments.read"] }), (url) => {
      if (url.includes("/admin/prospects")) return jsonResponse(200, []);
      if (url.includes("/admin/leads")) return jsonResponse(200, [buildLead()]);
      return undefined;
    });

    const promoteButton = await screen.findByRole("button", { name: "Promover a prospecto" });
    expect(promoteButton).toBeDisabled();
  });
});
