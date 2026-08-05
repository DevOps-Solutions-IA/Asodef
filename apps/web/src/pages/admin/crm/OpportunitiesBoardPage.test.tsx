import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { OpportunitiesBoardPage } from "./OpportunitiesBoardPage";
import { buildCurrentUser, mockAuthFetch, renderWithAuth } from "../../../test-utils/auth-test-helpers";

function jsonResponse(status: number, body: unknown): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}

function buildOpportunity(overrides: Partial<{ id: string; stage: string; proposedBenefit: string }> = {}) {
  return {
    id: overrides.id ?? "opp-1",
    prospectId: "prospect-1",
    companyId: null,
    assignedUserId: null,
    stage: overrides.stage ?? "NEGOTIATION",
    estimatedValueCents: 500000,
    proposedBenefit: overrides.proposedBenefit ?? "Plan corporativo",
    expectedClosingDate: null,
    probability: null,
    wonLostReason: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function renderBoard(currentUser: ReturnType<typeof buildCurrentUser>, additionalHandlers: (url: string, init: RequestInit | undefined) => Promise<Response> | undefined) {
  mockAuthFetch(currentUser, additionalHandlers);
  return renderWithAuth(
    <MemoryRouter initialEntries={["/admin/crm/oportunidades"]}>
      <OpportunitiesBoardPage />
    </MemoryRouter>,
  );
}

describe("OpportunitiesBoardPage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders a column per pipeline stage with the opportunity card in its current stage's column", async () => {
    renderBoard(buildCurrentUser({ roles: ["COMMERCIAL"], permissions: ["crm.manage"] }), (url) => {
      if (url.includes("/admin/opportunities")) return jsonResponse(200, [buildOpportunity({ stage: "NEGOTIATION" })]);
      return undefined;
    });

    expect(await screen.findByRole("heading", { name: /Negociación/ })).toBeInTheDocument();
    expect(screen.getByText("Plan corporativo")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Revisión legal/ })).toBeInTheDocument();
  });

  it("Example (AC): moving an opportunity from negotiation to legal_review calls the real API with the new stage", async () => {
    const opportunity = buildOpportunity({ stage: "NEGOTIATION" });
    const fetchMock = mockAuthFetch(buildCurrentUser({ roles: ["COMMERCIAL"], permissions: ["crm.manage"] }), (url, init) => {
      if (url.includes("/admin/opportunities") && !url.includes("/stage")) return jsonResponse(200, [opportunity]);
      if (url.includes("/stage") && init?.method === "POST") {
        return jsonResponse(200, { ...opportunity, stage: "LEGAL_REVIEW", warning: null });
      }
      return undefined;
    });
    renderWithAuth(
      <MemoryRouter initialEntries={["/admin/crm/oportunidades"]}>
        <OpportunitiesBoardPage />
      </MemoryRouter>,
    );

    const select = await screen.findByLabelText(`Cambiar etapa de ${opportunity.id}`);
    const user = userEvent.setup();
    await user.selectOptions(select, "LEGAL_REVIEW");

    await waitFor(() => {
      const stageCalls = fetchMock.mock.calls.filter(([input]) => String(input).includes(`/opportunities/${opportunity.id}/stage`));
      expect(stageCalls).toHaveLength(1);
    });
  });

  it("Negative case (AC): an actor without crm.manage sees the board read-only, with the stage select disabled", async () => {
    renderBoard(buildCurrentUser({ roles: ["FINANCE"], permissions: ["payments.read"] }), (url) => {
      if (url.includes("/admin/opportunities")) return jsonResponse(200, [buildOpportunity()]);
      return undefined;
    });

    const select = await screen.findByLabelText(/Cambiar etapa/);
    expect(select).toBeDisabled();
  });
});
