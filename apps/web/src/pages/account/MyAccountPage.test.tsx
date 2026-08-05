import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

  it("US-073: shows a Revocar action only for a GRANTED optional_marketing record, and confirms before revoking", async () => {
    let revokeCalled = false;
    renderPage((url, init) => {
      if (url.includes("/me/consent-records/optional_marketing/revoke") && init?.method === "POST") {
        revokeCalled = true;
        return jsonResponse(200, { id: "record-1", purposeKey: "optional_marketing", status: "REVOKED", legalDocumentVersionId: null, createdAt: "2026-01-15T10:00:00.000Z", revokedAt: "2026-01-20T10:00:00.000Z" });
      }
      if (url.includes("/me/consent-records")) {
        return jsonResponse(200, [
          {
            id: "record-1",
            purposeKey: "optional_marketing",
            status: "GRANTED",
            policyVersionNumber: null,
            source: "contact_form",
            acceptanceMethod: "checkbox",
            createdAt: "2026-01-15T10:00:00.000Z",
            revokedAt: null,
          },
          {
            id: "record-2",
            purposeKey: "data_processing",
            status: "GRANTED",
            policyVersionNumber: 1,
            source: "contact_form",
            acceptanceMethod: "checkbox",
            createdAt: "2026-01-10T10:00:00.000Z",
            revokedAt: null,
          },
        ]);
      }
      return undefined;
    });

    const marketingRow = (await screen.findByText("Marketing opcional")).closest("li")!;
    expect(within(marketingRow).getByRole("button", { name: "Revocar" })).toBeInTheDocument();

    const dataProcessingRow = screen.getByText("Tratamiento de datos").closest("li")!;
    expect(within(dataProcessingRow).queryByRole("button", { name: "Revocar" })).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(within(marketingRow).getByRole("button", { name: "Revocar" }));

    const dialog = await screen.findByRole("dialog");
    expect(revokeCalled).toBe(false);

    await user.click(within(dialog).getByRole("button", { name: "Confirmar revocación" }));
    await waitFor(() => expect(revokeCalled).toBe(true));
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
