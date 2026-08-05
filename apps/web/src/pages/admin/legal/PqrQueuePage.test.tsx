import { afterEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { PqrQueuePage } from "./PqrQueuePage";
import { buildCurrentUser, mockAuthFetch, renderWithAuth } from "../../../test-utils/auth-test-helpers";

function jsonResponse(status: number, body: unknown): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}

function buildCase() {
  return {
    id: "pqr-1",
    caseNumber: "PQR-0001",
    category: "queja",
    applicantName: "Cliente de Prueba",
    applicantContact: "cliente@example.com",
    relatedCustomerId: null,
    relatedPaymentOrderId: null,
    relatedContractId: null,
    description: "No recibí respuesta.",
    assignedTeam: null,
    priority: null,
    dueDate: null,
    status: "IN_REVIEW",
    resolution: null,
    satisfactionScore: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function renderPage(additionalHandlers: (url: string, init: RequestInit | undefined) => Promise<Response> | undefined) {
  mockAuthFetch(buildCurrentUser({ roles: ["CUSTOMER_SERVICE"], permissions: ["pqr.manage"] }), additionalHandlers);
  return renderWithAuth(
    <MemoryRouter initialEntries={["/admin/pqr"]}>
      <PqrQueuePage />
    </MemoryRouter>,
  );
}

describe("PqrQueuePage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("lists queued cases", async () => {
    renderPage((url) => {
      if (url.includes("/admin/pqr-cases")) return jsonResponse(200, { items: [buildCase()], total: 1, page: 1, pageSize: 20 });
      return undefined;
    });

    expect(await screen.findByText("Cliente de Prueba")).toBeInTheDocument();
    expect(screen.getByText("PQR-0001")).toBeInTheDocument();
  });

  it("Negative case (AC): resolving a PQR case without resolution text is blocked client-side", async () => {
    let transitionCalled = false;
    renderPage((url, init) => {
      if (url.includes("/transition") && init?.method === "POST") {
        transitionCalled = true;
        return jsonResponse(200, buildCase());
      }
      if (url.includes("/admin/pqr-cases")) return jsonResponse(200, { items: [buildCase()], total: 1, page: 1, pageSize: 20 });
      return undefined;
    });

    const user = userEvent.setup();
    await screen.findByText("Cliente de Prueba");
    await user.click(screen.getByRole("button", { name: "Cambiar estado" }));

    const dialog = await screen.findByRole("dialog");
    await user.selectOptions(screen.getByLabelText("Nuevo estado"), "RESOLVED");
    await user.type(screen.getByLabelText("Notas"), "Se resolvió el caso.");
    await user.click(screen.getByRole("button", { name: "Confirmar" }));

    expect(dialog).toHaveTextContent("Debes ingresar el texto de resolución");
    expect(transitionCalled).toBe(false);
  });

  it("Example (AC): resolving with resolution text succeeds", async () => {
    let transitionBody: unknown = null;
    renderPage((url, init) => {
      if (url.includes("/transition") && init?.method === "POST") {
        transitionBody = JSON.parse(String(init.body));
        return jsonResponse(200, { ...buildCase(), status: "RESOLVED", resolution: "Se envió respuesta al cliente." });
      }
      if (url.includes("/admin/pqr-cases")) return jsonResponse(200, { items: [buildCase()], total: 1, page: 1, pageSize: 20 });
      return undefined;
    });

    const user = userEvent.setup();
    await screen.findByText("Cliente de Prueba");
    await user.click(screen.getByRole("button", { name: "Cambiar estado" }));

    await user.selectOptions(screen.getByLabelText("Nuevo estado"), "RESOLVED");
    await user.type(screen.getByLabelText("Notas"), "Se resolvió el caso.");
    await user.type(screen.getByLabelText("Texto de resolución"), "Se envió respuesta al cliente.");
    await user.click(screen.getByRole("button", { name: "Confirmar" }));

    await screen.findByText("Cliente de Prueba");
    expect(transitionBody).toMatchObject({ status: "RESOLVED", resolution: "Se envió respuesta al cliente." });
  });
});
