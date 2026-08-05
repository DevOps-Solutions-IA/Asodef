import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AdminLegalPage } from "./AdminLegalPage";
import { buildCurrentUser, mockAuthFetch, renderWithAuth } from "../../../test-utils/auth-test-helpers";

function jsonResponse(status: number, body: unknown): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}

function buildDocumentSummary(overrides: Partial<{ id: string; title: string; latestVersionStatus: string }> = {}) {
  return {
    id: overrides.id ?? "doc-1",
    type: "privacy_policy",
    title: overrides.title ?? "Política de privacidad",
    slug: "politica-de-privacidad",
    currentVersionId: null,
    latestVersionStatus: overrides.latestVersionStatus ?? "PENDING_APPROVAL",
    latestVersionNumber: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function buildDocumentDetail(status: string) {
  return {
    id: "doc-1",
    type: "privacy_policy",
    title: "Política de privacidad",
    slug: "politica-de-privacidad",
    currentVersionId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    versions: [
      {
        id: "version-1",
        version: 1,
        status,
        draftContent: { sections: [] },
        approvedContent: null,
        effectiveDate: null,
        expirationDate: null,
        changeSummary: null,
        approvedByUserId: null,
        approvalDate: null,
        publicationDate: null,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ],
  };
}

function renderPage(currentUser: ReturnType<typeof buildCurrentUser>, additionalHandlers: (url: string, init: RequestInit | undefined) => Promise<Response> | undefined) {
  mockAuthFetch(currentUser, additionalHandlers);
  return renderWithAuth(
    <MemoryRouter initialEntries={["/admin/legal"]}>
      <AdminLegalPage />
    </MemoryRouter>,
  );
}

describe("AdminLegalPage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("lists documents and shows the selected document's pending-approval actions", async () => {
    renderPage(buildCurrentUser({ roles: ["ADMIN"], permissions: ["content.manage", "legal.approve"] }), (url) => {
      if (url.includes("/admin/legal-documents/doc-1")) return jsonResponse(200, buildDocumentDetail("PENDING_APPROVAL"));
      if (url.includes("/admin/legal-documents")) return jsonResponse(200, [buildDocumentSummary()]);
      return undefined;
    });

    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /Política de privacidad/ }));

    expect(await screen.findByRole("button", { name: "Aprobar" })).toBeInTheDocument();
  });

  it("Example (AC): approving requires confirmation before calling the API", async () => {
    let approveCalled = false;
    renderPage(buildCurrentUser({ roles: ["SUPER_ADMIN"], permissions: ["content.manage", "legal.approve"] }), (url, init) => {
      if (url.includes("/approve") && init?.method === "POST") {
        approveCalled = true;
        return jsonResponse(200, { ...buildDocumentDetail("APPROVED").versions[0], status: "APPROVED" });
      }
      if (url.includes("/admin/legal-documents/doc-1")) return jsonResponse(200, buildDocumentDetail("PENDING_APPROVAL"));
      if (url.includes("/admin/legal-documents")) return jsonResponse(200, [buildDocumentSummary()]);
      return undefined;
    });

    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /Política de privacidad/ }));
    await user.click(await screen.findByRole("button", { name: "Aprobar" }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Aprobar versión");
    expect(approveCalled).toBe(false);

    await user.click(within(dialog).getByRole("button", { name: "Confirmar aprobación" }));
    await waitFor(() => expect(approveCalled).toBe(true));
  });

  it("Negative case (AC): the approve action is disabled for an actor without legal.approve", async () => {
    renderPage(buildCurrentUser({ roles: ["ADMIN"], permissions: ["content.manage"] }), (url) => {
      if (url.includes("/admin/legal-documents/doc-1")) return jsonResponse(200, buildDocumentDetail("PENDING_APPROVAL"));
      if (url.includes("/admin/legal-documents")) return jsonResponse(200, [buildDocumentSummary()]);
      return undefined;
    });

    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /Política de privacidad/ }));

    expect(await screen.findByRole("button", { name: "Aprobar" })).toBeDisabled();
  });
});
