import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdminAuditPage } from "./AdminAuditPage";
import { buildCurrentUser, mockAuthFetch, renderWithAuth } from "../../test-utils/auth-test-helpers";

function response(status: number, body: unknown): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}

const PAGE = {
  items: [
    {
      id: "security:event-1",
      source: "SECURITY",
      action: "LOGIN_FAILED",
      result: "UNKNOWN",
      timestamp: "2026-08-19T18:00:00.000Z",
      actorId: null,
      entityType: null,
      entityId: null,
      previousState: null,
      newState: null,
      requestId: "request-1",
      correlationId: null,
      metadata: { password: "hostile-secret" },
      ipAddress: "203.0.113.99",
      userAgent: "hostile-user-agent",
    },
    {
      id: "audit:event-2",
      source: "AUDIT",
      action: "COMPANY_UPDATED",
      result: "SUCCESS",
      timestamp: "2026-08-19T17:00:00.000Z",
      actorId: "actor-1",
      entityType: "COMPANY",
      entityId: "company-1",
      previousState: "PENDING",
      newState: "ACTIVE",
      requestId: null,
      correlationId: null,
    },
  ],
  total: 2,
  pageSize: 20,
  nextCursor: "opaque-next-cursor",
};

function renderPage(payload: unknown = PAGE, status = 200) {
  mockAuthFetch(buildCurrentUser({ roles: ["AUDITOR"], permissions: ["audit.read"] }), (url) => {
    if (url.includes("/admin/auditoria?")) return response(status, payload);
    return undefined;
  });
  return renderWithAuth(<AdminAuditPage />);
}

describe("AdminAuditPage", () => {
  afterEach(() => vi.restoreAllMocks());

  it("renders the minimized real timeline and unknown fields honestly", async () => {
    renderPage();
    expect(await screen.findByRole("heading", { name: "Auditoría" })).toBeInTheDocument();
    expect(await screen.findByText("LOGIN_FAILED")).toBeInTheDocument();
    expect(screen.getByText("COMPANY_UPDATED")).toBeInTheDocument();
    expect(screen.getAllByText("Desconocido").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("Aplicado").length).toBeGreaterThanOrEqual(2);
    expect(document.body.textContent).not.toMatch(/password|userAgent|ipAddress|metadata|hostile-secret|203\.0\.113\.99|hostile-user-agent/i);
  });

  it("sends explicit source/result filters to the real API client", async () => {
    const user = userEvent.setup();
    renderPage();
    const fetchSpy = vi.mocked(global.fetch);
    await screen.findByText("LOGIN_FAILED");

    await user.selectOptions(screen.getByLabelText("Fuente"), "SECURITY");
    await user.selectOptions(screen.getByLabelText("Resultado"), "UNKNOWN");
    await user.type(screen.getByLabelText("Acción exacta"), "LOGIN_FAILED");
    await user.type(screen.getByLabelText("Desde"), "2026-08-01");
    await user.type(screen.getByLabelText("Hasta"), "2026-08-19");

    await waitFor(() => expect(fetchSpy.mock.calls.some(([input]) => {
        const url = String(input);
        return url.includes("source=SECURITY") && url.includes("result=UNKNOWN")
          && url.includes("action=LOGIN_FAILED") && url.includes("from=") && url.includes("to=");
      })).toBe(true));
  });

  it("uses the opaque cursor to reach older history without an arbitrary page ceiling", async () => {
    const user = userEvent.setup();
    renderPage();
    const fetchSpy = vi.mocked(global.fetch);
    await screen.findByText("LOGIN_FAILED");
    await user.click(screen.getByRole("button", { name: "Siguiente" }));

    expect(await screen.findByText(/Página 2/)).toBeInTheDocument();
    await waitFor(() => expect(fetchSpy.mock.calls.some(([input]) => String(input).includes("cursor=opaque-next-cursor"))).toBe(true));
    expect(screen.getByRole("button", { name: "Anterior" })).toBeEnabled();
  });

  it("does not render stale rows while a cursor page is loading or accept a duplicate advance", async () => {
    let resolveNext: ((value: Response) => void) | undefined;
    const fetchSpy = mockAuthFetch(buildCurrentUser({ roles: ["AUDITOR"], permissions: ["audit.read"] }), (url) => {
      if (!url.includes("/admin/auditoria?")) return undefined;
      if (url.includes("cursor=")) return new Promise<Response>((resolve) => { resolveNext = resolve; });
      return response(200, PAGE);
    });
    const user = userEvent.setup();
    renderWithAuth(<AdminAuditPage />);
    await screen.findByText("LOGIN_FAILED");
    await user.click(screen.getByRole("button", { name: "Siguiente" }));

    expect(screen.queryByText("LOGIN_FAILED")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Siguiente" })).toBeDisabled();
    expect(fetchSpy.mock.calls.filter(([input]) => String(input).includes("cursor=")).length).toBe(1);
    resolveNext?.(new Response(JSON.stringify({ items: [], total: 2, pageSize: 20, nextCursor: null }), { status: 200, headers: { "Content-Type": "application/json" } }));
    expect(await screen.findByText("Sin eventos para los filtros seleccionados")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Anterior" })).toBeEnabled();
  });

  it("shows a safe error state without stale timeline data", async () => {
    renderPage({ message: "database internals" }, 503);
    expect(await screen.findByText("Ocurrió un problema en el servidor. Intenta nuevamente más tarde.")).toBeInTheDocument();
    expect(screen.queryByText("LOGIN_FAILED")).not.toBeInTheDocument();
  });
});
