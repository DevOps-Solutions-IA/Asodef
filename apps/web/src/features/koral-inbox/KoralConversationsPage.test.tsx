import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildCurrentUser, mockAuthFetch, renderWithAuth } from "../../test-utils/auth-test-helpers";
import { KoralConversationsPage } from "./KoralConversationsPage";

const summary = { id: "11111111-1111-4111-8111-111111111111", status: "WAITING_USER", priority: "NORMAL", version: 3, subject: "Consulta de pago", lastMessageAt: "2026-08-26T10:00:00.000Z", slaDueAt: null, slaState: "NONE", queue: "ALL", activeAssignee: null, channels: ["WEB"], tags: [], unread: false, updatedAt: "2026-08-26T10:00:00.000Z" };
const detail = { ...summary, participants: [], messages: [{ id: "m1", direction: "INBOUND", status: "RECEIVED", contentType: "text/plain", body: "¿Dónde consulto mi pago?", correlationId: "correlation-1", occurredAt: "2026-08-26T10:00:00.000Z", createdAt: "2026-08-26T10:00:00.000Z", attachments: [] }], assignments: [], internalNotes: [], events: [{ id: "e1", eventType: "MESSAGE_RECEIVED", actorUserId: null, requestId: null, correlationId: "correlation-1", previousStatus: null, newStatus: "WAITING_USER", result: "SUCCESS", reason: null, createdAt: "2026-08-26T10:00:00.000Z" }], identityTimeline: [], knowledgeRetrievals: [{ id: "k1", result: "SUFFICIENT_EVIDENCE", reasonCode: null, correlationId: "correlation-1", citationCount: 1, createdAt: "2026-08-26T10:00:00.000Z" }], channelSessions: [], resolvedAt: null, closedAt: null, createdAt: "2026-08-26T10:00:00.000Z" };
const response = (status: number, body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));

afterEach(() => vi.unstubAllGlobals());

describe("KoralConversationsPage", () => {
  it("reads the canonical list/detail without issuing mutations", async () => {
    const fetchMock = mockAuthFetch(buildCurrentUser({ permissions: ["koral.conversations.read"] }), (url) => {
      if (url.endsWith(`/${summary.id}`)) return response(200, detail);
      if (url.includes("/admin/koral/conversations?")) return response(200, { items: [summary], total: 1, page: 1, pageSize: 30 });
      return undefined;
    });
    renderWithAuth(<KoralConversationsPage />);
    fireEvent.click(await screen.findByRole("button", { name: /Consulta de pago/i }));
    expect(await screen.findByText("¿Dónde consulto mi pago?")).toBeInTheDocument();
    expect(screen.getByText("MESSAGE_RECEIVED")).toBeInTheDocument();
    expect(screen.getByText("SUFFICIENT_EVIDENCE")).toBeInTheDocument();
    expect(screen.queryByText("Gestión humana")).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.every(([, init]) => !init?.method || init.method === "GET")).toBe(true);
  });

  it("applies canonical status/channel filters and handles list failure", async () => {
    const fetchMock = mockAuthFetch(buildCurrentUser({ permissions: ["koral.conversations.read"] }), (url) => url.includes("channel=WEB") ? response(503, { message: "Servicio no disponible" }) : response(200, { items: [], total: 0, page: 1, pageSize: 30 }));
    renderWithAuth(<KoralConversationsPage />);
    fireEvent.change(await screen.findByLabelText("Estado"), { target: { value: "WAITING_USER" } });
    await waitFor(() => expect(fetchMock.mock.calls.some(([input]) => String(input).includes("status=WAITING_USER"))).toBe(true));
    fireEvent.change(screen.getByLabelText("Canal"), { target: { value: "WEB" } });
    expect(await screen.findByRole("button", { name: "Reintentar" })).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes("status=WAITING_USER") && String(input).includes("channel=WEB"))).toBe(true);
  });
});
