import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildCurrentUser, mockAuthFetch, renderWithAuth } from "../../test-utils/auth-test-helpers";
import { KoralHumanInboxPage } from "./KoralHumanInboxPage";

const conversation = {
  id: "11111111-1111-4111-8111-111111111111",
  status: "HUMAN_ACTIVE",
  priority: "HIGH",
  version: 7,
  subject: "Ayuda con afiliación",
  lastMessageAt: "2026-08-23T12:00:00.000Z",
  slaDueAt: "2026-08-23T12:20:00.000Z",
  slaState: "DUE_SOON",
  queue: "MINE",
  activeAssignee: { id: "user-1", displayName: "Asesora Uno" },
  channels: ["WEB"],
  tags: ["afiliacion"],
  unread: true,
  updatedAt: "2026-08-23T12:00:00.000Z",
};

const detail = {
  ...conversation,
  participants: [],
  messages: [{ id: "message-1", direction: "INBOUND", status: "RECEIVED", contentType: "text/plain", body: "Necesito ayuda", correlationId: "corr-1", occurredAt: "2026-08-23T12:00:00.000Z", createdAt: "2026-08-23T12:00:00.000Z", attachments: [] }],
  assignments: [],
  internalNotes: [],
  events: [],
  identityTimeline: [],
  channelSessions: [],
  resolvedAt: null,
  closedAt: null,
  createdAt: "2026-08-23T11:00:00.000Z",
};

function response(status: number, body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}

afterEach(() => vi.unstubAllGlobals());

describe("KoralHumanInboxPage", () => {
  it("renders a truthful empty state and the explicit delivery dependency", async () => {
    mockAuthFetch(buildCurrentUser({ permissions: ["koral.conversations.read"] }), (url) =>
      url.includes("/admin/koral/conversations") ? response(200, { items: [], total: 0, page: 1, pageSize: 30 }) : undefined,
    );
    renderWithAuth(<KoralHumanInboxPage />);
    expect(await screen.findByRole("heading", { name: "Inbox" })).toBeInTheDocument();
    expect(await screen.findByText("No hay conversaciones en esta vista")).toBeInTheDocument();
    expect(screen.getByText(/respuesta al canal permanece deshabilitada/i)).toBeInTheDocument();
  });

  it("shows ownership, messages, SLA and keeps human delivery disabled while HUMAN_ACTIVE", async () => {
    const fetchMock = mockAuthFetch(buildCurrentUser({ id: "user-1", permissions: ["koral.conversations.read", "koral.conversations.manage"] }), (url, init) => {
      if (url.endsWith("/eligible-assignees")) return response(200, [{ id: "user-1", displayName: "Asesora Uno" }]);
      if (url.endsWith(`/${conversation.id}/read`) && init?.method === "POST") return response(200, { conversationId: conversation.id, unread: false });
      if (url.endsWith(`/${conversation.id}`)) return response(200, detail);
      if (url.includes("/admin/koral/conversations?")) return response(200, { items: [conversation], total: 1, page: 1, pageSize: 30 });
      return undefined;
    });
    renderWithAuth(<KoralHumanInboxPage />);
    fireEvent.click(await screen.findByRole("button", { name: /Ayuda con afiliación/i }));
    expect(await screen.findByText("Necesito ayuda")).toBeInTheDocument();
    expect(screen.getByText("Autorrespuesta de Koral deshabilitada")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enviar respuesta" })).toBeDisabled();
    expect(screen.getByText("SLA próximo")).toBeInTheDocument();
    await waitFor(() => expect(fetchMock.mock.calls.some(([input]) => String(input).endsWith(`/${conversation.id}/read`))).toBe(true));
  });

  it("renders a rate-limit error safely and offers retry", async () => {
    mockAuthFetch(buildCurrentUser({ permissions: ["koral.conversations.read"] }), (url) =>
      url.includes("/admin/koral/conversations") ? response(429, { statusCode: 429, error: "Too Many Requests", message: "safe", retryAfterSeconds: 20 }) : undefined,
    );
    renderWithAuth(<KoralHumanInboxPage />);
    expect(await screen.findByText("safe")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
  });
});
