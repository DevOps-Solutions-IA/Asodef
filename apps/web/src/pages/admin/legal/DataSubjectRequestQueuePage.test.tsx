import { afterEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { DataSubjectRequestQueuePage } from "./DataSubjectRequestQueuePage";
import { buildCurrentUser, mockAuthFetch, renderWithAuth } from "../../../test-utils/auth-test-helpers";

function jsonResponse(status: number, body: unknown): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}

function buildRequest() {
  return {
    id: "dsr-1",
    publicReference: "DSR-0001",
    type: "access",
    requesterName: "Cliente de Prueba",
    requesterEmail: "cliente@example.com",
    requesterDocument: "1000000000",
    identityVerificationStatus: null,
    description: "Quiero acceder a mis datos.",
    assignedUserId: null,
    dueDate: null,
    status: "RECEIVED",
    resolution: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function renderPage(additionalHandlers: (url: string, init: RequestInit | undefined) => Promise<Response> | undefined) {
  mockAuthFetch(buildCurrentUser({ roles: ["CUSTOMER_SERVICE"], permissions: ["data.manage"] }), additionalHandlers);
  return renderWithAuth(
    <MemoryRouter initialEntries={["/admin/solicitudes-de-datos"]}>
      <DataSubjectRequestQueuePage />
    </MemoryRouter>,
  );
}

describe("DataSubjectRequestQueuePage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("lists queued requests", async () => {
    renderPage((url) => {
      if (url.includes("/admin/data-subject-requests")) return jsonResponse(200, { items: [buildRequest()], total: 1, page: 1, pageSize: 20 });
      return undefined;
    });

    expect(await screen.findByText("Cliente de Prueba")).toBeInTheDocument();
    expect(screen.getByText("DSR-0001")).toBeInTheDocument();
  });

  it("Negative case (AC): transitioning to RESOLVED without resolution text is blocked client-side", async () => {
    let transitionCalled = false;
    renderPage((url, init) => {
      if (url.includes("/transition") && init?.method === "POST") {
        transitionCalled = true;
        return jsonResponse(200, buildRequest());
      }
      if (url.includes("/admin/data-subject-requests")) return jsonResponse(200, { items: [buildRequest()], total: 1, page: 1, pageSize: 20 });
      return undefined;
    });

    const user = userEvent.setup();
    await screen.findByText("Cliente de Prueba");
    await user.click(screen.getByRole("button", { name: "Cambiar estado" }));

    const dialog = await screen.findByRole("dialog");
    await user.selectOptions(screen.getByLabelText("Nuevo estado"), "RESOLVED");
    await user.type(screen.getByLabelText("Notas"), "Se completó la revisión.");
    await user.click(screen.getByRole("button", { name: "Confirmar" }));

    expect(dialog).toHaveTextContent("Debes ingresar el texto de resolución");
    expect(transitionCalled).toBe(false);
  });
});
