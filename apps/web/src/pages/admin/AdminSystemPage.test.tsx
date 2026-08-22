import { afterEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AdminSystemPage } from "./AdminSystemPage";
import {
  buildCurrentUser,
  mockAuthFetch,
  renderWithAuth,
} from "../../test-utils/auth-test-helpers";

function response(status: number, body: unknown): Promise<Response> {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}
const component = (
  state: string,
  criticality = "CORE",
  impact = "Operación observada.",
) => ({
  state,
  criticality,
  operationalImpact: impact,
  latencyMs: 4,
  lastCheckedAt: "2026-08-19T18:00:00.000Z",
});
const SNAPSHOT = {
  generatedAt: "2026-08-19T18:00:00.000Z",
  core: {
    state: "HEALTHY",
    operationalImpact: "El núcleo administrativo está operativo.",
  },
  api: {
    ...component("HEALTHY"),
    uptimeSeconds: 7_500,
    releaseSha: "abc123",
    version: "0.1.0",
    migrationVersion: "20260819132100_notification_unknown_result",
  },
  services: { postgres: component("HEALTHY"), redis: component("HEALTHY") },
  integrations: {
    master: component(
      "UNAVAILABLE",
      "OPTIONAL",
      "Integración externa no disponible; el núcleo administrativo continúa independiente.",
    ),
    bold: { ...component("UNKNOWN", "OPTIONAL"), mode: "sandbox" },
    smtp: { ...component("UNAVAILABLE", "IMPORTANT"), configured: true },
  },
  security: {
    state: "HEALTHY",
    recoveryChannel: "CONFIGURED",
    mfaRequired: false,
  },
  notifications: {
    queueState: "HEALTHY",
    transportState: "UNAVAILABLE",
    transport: "SMTP",
    transportConfigured: true,
    backlog: 0,
    queued: 0,
    processing: 0,
    retryPending: 0,
    failed: 0,
    unknownResult: 0,
    deadLetter: 0,
  },
};

function renderPage(
  payload: unknown = SNAPSHOT,
  status = 200,
  initialEntry = "/admin/sistema",
) {
  mockAuthFetch(
    buildCurrentUser({
      roles: ["SUPER_ADMIN"],
      permissions: ["settings.manage"],
    }),
    (url) =>
      url.endsWith("/admin/sistema") ? response(status, payload) : undefined,
  );
  return renderWithAuth(
    <MemoryRouter initialEntries={[initialEntry]}>
      <AdminSystemPage />
    </MemoryRouter>,
  );
}

describe("AdminSystemPage", () => {
  afterEach(() => vi.restoreAllMocks());

  it("presents a healthy core when API, Postgres and Redis are healthy even if Master is unavailable", async () => {
    renderPage();
    expect(
      await screen.findByRole("heading", { name: "Sistema" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("El núcleo administrativo está operativo."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Master / Firebird" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/núcleo administrativo continúa independiente/),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/núcleo administrativo no dispone/),
    ).not.toBeInTheDocument();
  });

  it.each(["UNKNOWN", "NOT_CONFIGURED"])(
    "never presents %s as healthy",
    async (state) => {
      renderPage({
        ...SNAPSHOT,
        integrations: {
          ...SNAPSHOT.integrations,
          bold: { ...SNAPSHOT.integrations.bold, state },
        },
      });
      expect(
        (
          await screen.findAllByText(
            state === "UNKNOWN" ? "Desconocido" : "No configurado",
          )
        ).length,
      ).toBeGreaterThan(0);
    },
  );

  it("shows a required core failure as unavailable", async () => {
    renderPage({
      ...SNAPSHOT,
      core: {
        state: "UNAVAILABLE",
        operationalImpact:
          "El núcleo administrativo no dispone de una dependencia esencial.",
      },
      services: { ...SNAPSHOT.services, postgres: component("UNAVAILABLE") },
    });
    expect(
      await screen.findByText(
        "El núcleo administrativo no dispone de una dependencia esencial.",
      ),
    ).toBeInTheDocument();
    expect(
      (await screen.findAllByText("No disponible")).length,
    ).toBeGreaterThan(0);
  });

  it("explains that zero queue metrics and an unavailable transport are different facts", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(
      await screen.findByRole("button", { name: "Notificaciones" }),
    );
    expect(
      screen.getByText(/una cola vacía no demuestra que SMTP esté saludable/),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Estado de la cola").parentElement,
    ).toHaveTextContent("Operativo");
    expect(
      screen.getByText("Transporte de entrega").parentElement,
    ).toHaveTextContent("No disponible");
    expect(screen.getAllByText("0").length).toBeGreaterThanOrEqual(7);
  });

  it("exposes all technical sections through keyboard-operable secondary navigation", async () => {
    const user = userEvent.setup();
    renderPage();
    for (const label of [
      "Servicios",
      "Integraciones",
      "Notificaciones",
      "Versiones",
      "Seguridad técnica",
      "Diagnóstico",
    ])
      expect(
        await screen.findByRole("button", { name: label }),
      ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Versiones" }));
    expect(screen.getByText("abc123")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /deploy/i }),
    ).not.toBeInTheDocument();
  });

  it("shows the safe request error state", async () => {
    renderPage({ message: "No disponible" }, 503);
    expect(
      await screen.findByText(
        "Ocurrió un problema en el servidor. Intenta nuevamente más tarde.",
      ),
    ).toBeInTheDocument();
  });
});
