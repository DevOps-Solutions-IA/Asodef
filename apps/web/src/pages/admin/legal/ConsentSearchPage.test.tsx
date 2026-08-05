import { afterEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { ConsentSearchPage } from "./ConsentSearchPage";
import { buildCurrentUser, mockAuthFetch, renderWithAuth } from "../../../test-utils/auth-test-helpers";

function jsonResponse(status: number, body: unknown): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}

function buildRecord() {
  return {
    id: "consent-1",
    purposeKey: "optional_marketing",
    status: "GRANTED",
    subjectType: "customer" as const,
    subjectId: "customer-1",
    legalDocumentVersionId: "version-1",
    policyVersionNumber: 3,
    ipAddress: "203.0.113.9",
    userAgent: "vitest-agent",
    source: "web",
    acceptanceMethod: "explicit_action",
    createdAt: "2026-01-01T00:00:00.000Z",
    revokedAt: null,
  };
}

function renderPage(additionalHandlers: (url: string, init: RequestInit | undefined) => Promise<Response> | undefined) {
  mockAuthFetch(buildCurrentUser({ roles: ["CUSTOMER_SERVICE"], permissions: ["data.manage"] }), additionalHandlers);
  return renderWithAuth(
    <MemoryRouter initialEntries={["/admin/consentimientos"]}>
      <ConsentSearchPage />
    </MemoryRouter>,
  );
}

describe("ConsentSearchPage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("Example (AC): lists results and shows full evidence (policy version, ip, timestamp, method) on selection", async () => {
    renderPage((url) => {
      if (url.includes("/admin/consent-records")) return jsonResponse(200, { items: [buildRecord()], total: 1, page: 1, pageSize: 20 });
      return undefined;
    });

    const user = userEvent.setup();
    const row = await screen.findByText("optional_marketing");
    await user.click(row);

    expect(await screen.findByText("203.0.113.9")).toBeInTheDocument();
    expect(screen.getByText("explicit_action")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("shows an empty state when no records match", async () => {
    renderPage((url) => {
      if (url.includes("/admin/consent-records")) return jsonResponse(200, { items: [], total: 0, page: 1, pageSize: 20 });
      return undefined;
    });

    expect(await screen.findByText("No hay registros que coincidan")).toBeInTheDocument();
  });
});
