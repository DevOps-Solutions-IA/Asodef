import { afterEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { AdminSystemPage } from "./AdminSystemPage";
import { buildCurrentUser, mockAuthFetch, renderWithAuth } from "../../test-utils/auth-test-helpers";

function response(status: number, body: unknown): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}

const SNAPSHOT = {
  generatedAt: "2026-08-19T18:00:00.000Z",
  api: {
    status: "AVAILABLE",
    uptimeSeconds: 7_500,
    releaseSha: "abc123",
    version: "0.1.0",
    migrationVersion: "20260819132100_notification_unknown_result",
  },
  dependencies: {
    postgres: { status: "AVAILABLE", latencyMs: 8 },
    redis: { status: "AVAILABLE", latencyMs: 3 },
    master: { status: "NOT_CONFIGURED", latencyMs: 1 },
  },
  notifications: { status: "AVAILABLE", backlog: 6, failed: 2, deadLetter: 1 },
};

function renderPage(payload: unknown = SNAPSHOT, status = 200) {
  mockAuthFetch(buildCurrentUser({ roles: ["SUPER_ADMIN"], permissions: ["settings.manage"] }), (url) => {
    if (url.endsWith("/admin/sistema")) return response(status, payload);
    return undefined;
  });
  return renderWithAuth(<AdminSystemPage />);
}

describe("AdminSystemPage", () => {
  afterEach(() => vi.restoreAllMocks());

  it("renders the real API snapshot and operational counts", async () => {
    renderPage();
    expect(await screen.findByRole("heading", { name: "Estado del sistema" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "PostgreSQL" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Master / Firebird" })).toBeInTheDocument();
    expect(screen.getByText("No configurado")).toBeInTheDocument();
    expect(screen.getByText("abc123")).toBeInTheDocument();
    expect(screen.getByText("6")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("renders degraded and unknown states explicitly, never as available", async () => {
    renderPage({
      ...SNAPSHOT,
      api: { ...SNAPSHOT.api, releaseSha: "UNKNOWN", version: "UNKNOWN", migrationVersion: "UNKNOWN" },
      dependencies: {
        postgres: { status: "UNAVAILABLE", latencyMs: 3_000 },
        redis: { status: "UNKNOWN", latencyMs: 3_000 },
        master: { status: "NOT_CONFIGURED", latencyMs: 0 },
      },
      notifications: { status: "UNKNOWN", backlog: null, failed: null, deadLetter: null },
    });

    expect(await screen.findByText("No disponible")).toBeInTheDocument();
    expect(screen.getAllByText("Desconocido").length).toBeGreaterThanOrEqual(4);
    expect(screen.getByText("No configurado")).toBeInTheDocument();
  });

  it("shows the safe request error state", async () => {
    renderPage({ message: "No disponible" }, 503);
    expect(await screen.findByText("Ocurrió un problema en el servidor. Intenta nuevamente más tarde.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "PostgreSQL" })).not.toBeInTheDocument();
  });
});
