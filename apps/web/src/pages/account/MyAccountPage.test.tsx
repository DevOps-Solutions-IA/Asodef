import { afterEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { MyAccountPage } from "./MyAccountPage";
import { buildCurrentUser, mockAuthFetch, renderWithAuth } from "../../test-utils/auth-test-helpers";

function jsonResponse(status: number, body: unknown): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}

function renderPage(additionalHandlers: (url: string, init: RequestInit | undefined) => Promise<Response> | undefined) {
  mockAuthFetch(buildCurrentUser(), additionalHandlers);
  return renderWithAuth(
    <MemoryRouter initialEntries={["/mi-cuenta"]}>
      <MyAccountPage />
    </MemoryRouter>,
  );
}

describe("MyAccountPage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("US-071 AC: shows the caller's own consent records with purpose/status/version", async () => {
    renderPage((url) => {
      if (url.includes("/me/consent-records")) {
        return jsonResponse(200, [
          {
            id: "record-1",
            purposeKey: "data_processing",
            status: "GRANTED",
            policyVersionNumber: 2,
            source: "contact_form",
            acceptanceMethod: "checkbox",
            createdAt: "2026-01-15T10:00:00.000Z",
            revokedAt: null,
          },
        ]);
      }
      return undefined;
    });

    expect(await screen.findByText("Tratamiento de datos")).toBeInTheDocument();
    expect(screen.getByText("Otorgado")).toBeInTheDocument();
    expect(screen.getByText(/Versión 2/)).toBeInTheDocument();
  });

  it("Negative case (AC): a user with zero consent records sees a real empty state, not an error", async () => {
    renderPage((url) => {
      if (url.includes("/me/consent-records")) return jsonResponse(200, []);
      return undefined;
    });

    expect(await screen.findByText("Sin registros")).toBeInTheDocument();
  });

  it("Negative case: a failed fetch shows an error state with a retry action", async () => {
    renderPage((url) => {
      if (url.includes("/me/consent-records")) return jsonResponse(500, { statusCode: 500, error: "Internal Server Error", message: "Error" });
      return undefined;
    });

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
  });
});
