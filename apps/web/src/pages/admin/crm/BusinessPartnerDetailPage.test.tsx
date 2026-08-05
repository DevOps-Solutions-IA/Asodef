import { afterEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { BusinessPartnerDetailPage } from "./BusinessPartnerDetailPage";
import { buildCurrentUser, mockAuthFetch, renderWithAuth } from "../../../test-utils/auth-test-helpers";

function jsonResponse(status: number, body: unknown): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}

function buildPartner(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "partner-1",
    legalName: "Aliado Legal S.A.S.",
    tradeName: "Aliado Comercial",
    nit: "900333444",
    sector: "Retail",
    city: "Cali",
    address: "Calle 1 # 2-3",
    phone: "3000000000",
    corporateEmail: "aliado@example.com",
    website: null,
    legalRepresentative: null,
    commercialContactId: null,
    agreementType: "Descuento directo",
    benefitsOffered: { description: "10% de descuento" },
    discountConditions: "Presentando carné",
    geographicCoverage: "Nacional",
    validFrom: null,
    validUntil: null,
    logoPath: null,
    status: "PROSPECT",
    approvalStatus: null,
    publicationStatus: "UNPUBLISHED",
    internalNotes: null,
    legalValidationConfirmed: false,
    commercialValidationConfirmed: false,
    benefitConfirmed: false,
    agreementValidityConfirmed: false,
    logoAuthorizationConfirmed: false,
    contactConfirmed: false,
    coverageConfirmed: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function renderPage(currentUser: ReturnType<typeof buildCurrentUser>, additionalHandlers: (url: string, init: RequestInit | undefined) => Promise<Response> | undefined) {
  mockAuthFetch(currentUser, additionalHandlers);
  return renderWithAuth(
    <MemoryRouter initialEntries={["/admin/crm/aliados/partner-1"]}>
      <Routes>
        <Route path="/admin/crm/aliados/:partnerId" element={<BusinessPartnerDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("BusinessPartnerDetailPage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the publication-gate checklist and the current publication status", async () => {
    renderPage(buildCurrentUser({ roles: ["COMMERCIAL"], permissions: ["partners.manage"] }), (url) => {
      if (url.includes("/admin/partners/partner-1")) return jsonResponse(200, buildPartner());
      return undefined;
    });

    expect(await screen.findByText("Aliado Comercial")).toBeInTheDocument();
    expect(screen.getByText("Validación legal")).toBeInTheDocument();
    expect(screen.getByText("Confirmación de cobertura")).toBeInTheDocument();
    expect(screen.getByText("UNPUBLISHED")).toBeInTheDocument();
  });

  it("Negative case (AC): the publish button stays disabled while any of the 7 checks is unconfirmed", async () => {
    renderPage(buildCurrentUser({ roles: ["COMMERCIAL"], permissions: ["partners.manage"] }), (url) => {
      if (url.includes("/admin/partners/partner-1")) {
        return jsonResponse(
          200,
          buildPartner({
            legalValidationConfirmed: true,
            commercialValidationConfirmed: true,
            benefitConfirmed: true,
            agreementValidityConfirmed: true,
            logoAuthorizationConfirmed: true,
            contactConfirmed: true,
            coverageConfirmed: false,
          }),
        );
      }
      return undefined;
    });

    const publishButton = await screen.findByRole("button", { name: "Publicar" });
    expect(publishButton).toBeDisabled();
  });

  it("Example (AC): all 7 checks confirmed enables the publish button", async () => {
    renderPage(buildCurrentUser({ roles: ["COMMERCIAL"], permissions: ["partners.manage"] }), (url) => {
      if (url.includes("/admin/partners/partner-1")) {
        return jsonResponse(
          200,
          buildPartner({
            legalValidationConfirmed: true,
            commercialValidationConfirmed: true,
            benefitConfirmed: true,
            agreementValidityConfirmed: true,
            logoAuthorizationConfirmed: true,
            contactConfirmed: true,
            coverageConfirmed: true,
          }),
        );
      }
      return undefined;
    });

    const publishButton = await screen.findByRole("button", { name: "Publicar" });
    expect(publishButton).not.toBeDisabled();
  });

  it("disables every checklist checkbox and the publish button for an actor without partners.manage", async () => {
    renderPage(buildCurrentUser({ roles: ["FINANCE"], permissions: ["payments.read"] }), (url) => {
      if (url.includes("/admin/partners/partner-1")) return jsonResponse(200, buildPartner());
      return undefined;
    });

    const checkbox = await screen.findByRole("checkbox", { name: "Validación legal" });
    expect(checkbox).toBeDisabled();
    expect(screen.getByRole("button", { name: "Publicar" })).toBeDisabled();
  });
});
