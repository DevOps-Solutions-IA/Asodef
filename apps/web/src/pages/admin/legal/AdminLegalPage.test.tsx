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

  it("US-070: shows the full version history and renders a past version read-only, without its workflow actions", async () => {
    const detail = {
      ...buildDocumentDetail("PUBLISHED"),
      versions: [
        {
          id: "version-2",
          version: 2,
          status: "PUBLISHED",
          draftContent: { sections: [{ heading: "Contacto", body: "v2" }] },
          approvedContent: { sections: [{ heading: "Contacto", body: "v2" }] },
          effectiveDate: null,
          expirationDate: null,
          changeSummary: null,
          approvedByUserId: "user-approver-1",
          approvalDate: "2026-02-01T00:00:00.000Z",
          publicationDate: "2026-02-02T00:00:00.000Z",
          createdAt: "2026-02-01T00:00:00.000Z",
        },
        {
          id: "version-1",
          version: 1,
          status: "REPLACED",
          draftContent: { sections: [{ heading: "Contacto", body: "v1" }] },
          approvedContent: { sections: [{ heading: "Contacto", body: "v1" }] },
          effectiveDate: null,
          expirationDate: null,
          changeSummary: null,
          approvedByUserId: "user-approver-1",
          approvalDate: "2026-01-01T00:00:00.000Z",
          publicationDate: "2026-01-01T00:00:00.000Z",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    };
    renderPage(buildCurrentUser({ roles: ["ADMIN"], permissions: ["content.manage", "legal.approve"] }), (url) => {
      if (url.includes("/admin/legal-documents/doc-1")) return jsonResponse(200, detail);
      if (url.includes("/admin/legal-documents")) return jsonResponse(200, [buildDocumentSummary()]);
      return undefined;
    });

    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /Política de privacidad/ }));

    const history = await screen.findByRole("list", { name: "Historial de versiones" });
    expect(within(history).getByText(/Versión 2 \(más reciente\)/)).toBeInTheDocument();
    expect(within(history).getByText("Versión 1")).toBeInTheDocument();

    // Viewing the latest version still shows its normal PUBLISHED info.
    expect(screen.getByText(/Visible en \/legal\//)).toBeInTheDocument();

    await user.click(within(history).getByText("Versión 1"));

    expect(screen.getByText(/versión anterior en modo de solo lectura/)).toBeInTheDocument();
    expect(screen.getByText(/"v1"/)).toBeInTheDocument();
    expect(screen.queryByText(/Visible en \/legal\//)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Publicar" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Volver a la versión actual" }));
    expect(screen.getByText(/Visible en \/legal\//)).toBeInTheDocument();
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
