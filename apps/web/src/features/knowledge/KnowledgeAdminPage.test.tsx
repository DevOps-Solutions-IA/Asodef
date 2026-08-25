import { fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildCurrentUser, mockAuthFetch, renderWithAuth } from "../../test-utils/auth-test-helpers";
import { KnowledgeAdminPage } from "./KnowledgeAdminPage";

const item = {
  id: "11111111-1111-4111-8111-111111111111",
  stableKey: "institucional-asodef",
  tenantKey: "ASODEF",
  revision: 1,
  createdAt: "2026-08-24T10:00:00.000Z",
  updatedAt: "2026-08-24T10:00:00.000Z",
  versions: [{
    id: "22222222-2222-4222-8222-222222222222",
    knowledgeItemId: "11111111-1111-4111-8111-111111111111",
    version: 1, revision: 3, title: "Información institucional", domain: "ASODEF_INSTITUCIONAL",
    audience: "PUBLIC", classification: "PUBLIC", language: "es", content: "ASODEF brinda orientación institucional verificable.", status: "PUBLISHED",
    effectiveFrom: null, effectiveUntil: null, requiresRevalidationAt: null, changeReason: "Publicación inicial",
    createdAt: "2026-08-24T10:00:00.000Z", updatedAt: "2026-08-24T10:00:00.000Z", publishedAt: "2026-08-24T10:00:00.000Z", retiredAt: null,
    source: { id: "33333333-3333-4333-8333-333333333333", sourceType: "MANUAL_AUTHORING", sourceReference: "manual://admin", sourceOwner: "ASODEF", sourceChecksum: "a".repeat(64), originalFileName: null, mimeType: null },
    publicationSnapshot: { id: "44444444-4444-4444-8444-444444444444", publishedAt: "2026-08-24T10:00:00.000Z", sourceChecksum: "a".repeat(64), chunkSetChecksum: "b".repeat(64) },
    auditEvents: [{ id: "55555555-5555-4555-8555-555555555555", action: "knowledge.version.published", previousStatus: "APPROVED", nextStatus: "PUBLISHED", changeReason: "Publicación inicial", createdAt: "2026-08-24T10:00:00.000Z", actorUserId: "user-1" }],
  }],
};

function response(body: unknown) { return Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } })); }
afterEach(() => vi.unstubAllGlobals());

describe("KnowledgeAdminPage", () => {
  it("renders real items, sources, lifecycle and audit data", async () => {
    const fetchMock = mockAuthFetch(buildCurrentUser({ permissions: ["knowledge.read", "knowledge.manage", "knowledge.publish"] }), (url) => {
      if (url.includes("/admin/knowledge/items?")) return response({ items: [item], total: 1, page: 1, pageSize: 30 });
      if (url.endsWith(`/admin/knowledge/items/${item.id}`)) return response(item);
      if (url.includes("/diff")) return response({ knowledgeItemId: item.id, current: { id: item.versions[0]!.id, version: 1, title: item.versions[0]!.title, content: item.versions[0]!.content, sourceChecksum: "a".repeat(64) }, previous: null });
      return undefined;
    });
    renderWithAuth(<KnowledgeAdminPage />);
    expect(await screen.findByRole("heading", { name: "Conocimiento" })).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: /Información institucional/ }));
    expect(await screen.findByText(/MANUAL_AUTHORING · manual:\/\/admin/)).toBeInTheDocument();
    expect(screen.getByText("knowledge.version.published")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Consultar diff gobernado" }));
    expect(await screen.findByText(/v1 actual/)).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([input, init]) => String(input).includes("/diff") && init?.method === "POST")).toBe(true);
    expect(screen.getByText("RUNTIME REAL")).toBeInTheDocument();
    expect(screen.queryByText(/NOT_CONFIGURED/)).not.toBeInTheDocument();
  });

  it("creates a manual DRAFT through the real API boundary", async () => {
    const fetchMock = mockAuthFetch(buildCurrentUser({ permissions: ["knowledge.read", "knowledge.manage"] }), (url, init) => {
      if (url.includes("/admin/knowledge/items?")) return response({ items: [], total: 0, page: 1, pageSize: 30 });
      if (url.endsWith("/admin/knowledge/versions/manual") && init?.method === "POST") return response({ ...item.versions[0], id: "66666666-6666-4666-8666-666666666666", knowledgeItemId: item.id, status: "DRAFT", revision: 0 });
      if (url.endsWith(`/admin/knowledge/items/${item.id}`)) return response(item);
      return undefined;
    });
    renderWithAuth(<KnowledgeAdminPage />);
    const form = await screen.findByRole("heading", { name: "Crear DRAFT" });
    const section = form.closest("section")!;
    fireEvent.change(within(section).getByLabelText("Stable key"), { target: { value: "nuevo-item" } });
    fireEvent.change(within(section).getByLabelText("Título"), { target: { value: "Nuevo conocimiento" } });
    fireEvent.change(within(section).getByLabelText("Contenido en español"), { target: { value: "Contenido institucional comprobable." } });
    fireEvent.change(within(section).getByLabelText("Motivo del cambio"), { target: { value: "Alta inicial gobernada" } });
    fireEvent.click(within(section).getByRole("button", { name: "Crear versión DRAFT" }));
    await vi.waitFor(() => expect(fetchMock.mock.calls.some(([input, init]) => String(input).endsWith("/admin/knowledge/versions/manual") && init?.method === "POST")).toBe(true));
  });
});
