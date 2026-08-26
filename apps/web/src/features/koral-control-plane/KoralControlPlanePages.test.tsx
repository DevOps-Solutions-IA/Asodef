import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildCurrentUser,
  mockAuthFetch,
  renderWithAuth,
} from "../../test-utils/auth-test-helpers";
import {
  KoralAgentsPage,
  KoralAnalyticsPage,
  KoralAutomationsPage,
  KoralOverviewPage,
  KoralToolsPage,
} from "./KoralControlPlanePages";

const generatedAt = "2026-08-26T15:00:00.000Z";
const window = {
  hours: 24,
  from: "2026-08-25T15:00:00.000Z",
  to: generatedAt,
};

function response(status: number, body: unknown): Promise<Response> {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

function admin() {
  return buildCurrentUser({
    roles: ["SUPER_ADMIN"],
    permissions: ["settings.manage"],
  });
}

afterEach(() => vi.restoreAllMocks());

describe("Koral Control Plane read-only pages", () => {
  it("renders the real overview metrics returned by the canonical endpoint", async () => {
    const fetchMock = mockAuthFetch(admin(), (url) =>
      url.endsWith("/admin/koral/control-plane")
        ? response(200, {
            generatedAt,
            runtime: {
              status: "CONFIGURED",
              aiRuntimeEnabled: true,
              provider: "openrouter",
              providerConfigured: true,
              providerPolicy: { timeoutMs: 5_000, maxAttempts: 2, circuitFailureThreshold: 3, circuitResetMs: 30_000 },
              agentProfiles: { total: 4, published: 3, configured: 2 },
              toolGateway: { registered: false, executable: 0 },
            },
            conversations: {
              total: 17,
              active: 15,
              aiActive: 8,
              humanRequired: 2,
              humanActive: 3,
              waitingUser: 4,
            },
            knowledge: { items: 3, versions: 5, byStatus: { PUBLISHED: 2 }, published: 2, eligiblePublished: 1 },
            handoff: { pending: 2, active: 3 },
            automations: {
              total: 5,
              active: 2,
              executions: 7,
              unresolvedDeadLetters: 1,
              executionRuntime: "COMMUNICATION_SEND_ONLY",
            },
            telemetry: {
              windowHours: 24,
              conversationEvents: 29,
              processingByStatus: { COMPLETED: 4 },
              retrievalByResult: { SUFFICIENT_EVIDENCE: 2 },
              failuresByCode: { PROVIDER_UNAVAILABLE: 1 },
              processingLatencyMs: { average: 25, p95: 40 },
              aiUsagePersistence: "LOG_AND_REDIS_TTL",
              recentActivity: [{ id: "event-1", eventType: "KORAL_RESPONSE_SENT", result: "SUCCESS", correlationId: "correlation-1", createdAt: generatedAt }],
            },
          })
        : undefined,
    );

    renderWithAuth(<KoralOverviewPage />);

    expect(await screen.findByRole("heading", { name: "Resumen" })).toBeInTheDocument();
    expect(await screen.findByText("Configurado")).toBeInTheDocument();
    expect(screen.getByText("Requieren atención humana").parentElement).toHaveTextContent("2");
    expect(screen.getByText("Automatizaciones activas").parentElement).toHaveTextContent("2");
    expect(screen.getByRole("heading", { name: "Grounding reciente" }).closest("section")).toHaveTextContent("SUFFICIENT_EVIDENCE");
    expect(fetchMock.mock.calls.some(([input]) => String(input).endsWith("/admin/koral/control-plane"))).toBe(true);
  });

  it("shows an honest empty state when the runtime publishes no agents", async () => {
    mockAuthFetch(admin(), (url) =>
      url.endsWith("/admin/koral/control-plane/runtime/agents")
        ? response(200, {
            generatedAt,
            runtime: {
              status: "DISABLED",
              aiRuntimeEnabled: false,
              provider: "openrouter",
              providerConfigured: false,
              providerPolicy: { timeoutMs: 5_000, maxAttempts: 2, circuitFailureThreshold: 3, circuitResetMs: 30_000 },
              knowledgeGateway: { registered: true, availability: "AVAILABLE", publishedVersions: 2 },
              toolGateway: { registered: false, availability: "UNAVAILABLE", executable: 0 },
            },
            agents: [],
          })
        : undefined,
    );

    renderWithAuth(<KoralAgentsPage />);

    expect(await screen.findByRole("heading", { name: "Agentes" })).toBeInTheDocument();
    expect(await screen.findByText("No hay perfiles de agente")).toBeInTheDocument();
    expect(screen.getByText("Deshabilitado")).toBeInTheDocument();
  });

  it("renders governed tools and dependencies without offering execution", async () => {
    mockAuthFetch(admin(), (url) =>
      url.endsWith("/admin/koral/control-plane/tools")
        ? response(200, {
            generatedAt,
            runtime: {
              registered: false,
              reason: "TOOL_GATEWAY_UNAVAILABLE",
            },
            summary: { total: 1, published: 1, review: 0, executable: 0 },
            dependencies: [
              {
                domain: "CRM",
              status: "CONFIGURED",
                reason: "Contrato de lectura disponible.",
                requiredContract: "crm.company.read.v1",
              },
            ],
            tools: [
              {
                name: "crm.company.read",
                version: "v1",
                status: "PUBLISHED",
                description: "Consulta una empresa mediante el servicio canónico.",
                purpose: "BUSINESS_APPLICATION_SERVICE",
                mutation: false,
                permission: "crm.read",
                minimumIdentityLevel: "AUTHENTICATED",
                confirmationRequired: false,
                dataClassification: "INTERNAL",
                applicationServiceMethod: "CompaniesService.findOne",
                inputSchema: { type: "object" },
                outputSchema: { type: "object" },
                runtimeExecutable: false,
              },
            ],
          })
        : undefined,
    );

    renderWithAuth(<KoralToolsPage />);

    expect(await screen.findByRole("heading", { name: "Herramientas" })).toBeInTheDocument();
    const table = await screen.findByRole("table", { name: "Catálogo gobernado de herramientas de Koral" });
    expect(within(table).getByRole("rowheader", { name: /crm\.company\.read/ })).toBeInTheDocument();
    expect(within(table).getByText("No ejecutable")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /ejecutar/i })).not.toBeInTheDocument();
  });

  it("renders real automation definitions, sanitized configuration and recent executions", async () => {
    const fetchMock = mockAuthFetch(admin(), (url) =>
      url.includes("/admin/koral/control-plane/automations?")
        ? response(200, {
            generatedAt,
            window,
            owner: "CONNECT_AUTOMATION",
            koralIntegration: "NOT_REGISTERED",
            supportedRuntimeActions: ["COMMUNICATION_SEND"],
            unsupportedDefinitionActions: ["TOOL_CALL", "EMIT_EVENT"],
            definitions: {
              total: 1,
              byStatus: { PUBLISHED: 1 },
              items: [
                {
                  id: "definition-1",
                  key: "welcome-message",
                  name: "Mensaje de bienvenida",
                  status: "PUBLISHED",
                  currentVersion: {
                    id: "version-1",
                    version: 2,
                    status: "PUBLISHED",
                    triggerType: "DOMAIN_EVENT",
                    trigger: { eventType: "lead.created.v1" },
                    conditions: [],
                    actions: [{ type: "COMMUNICATION_SEND" }],
                    executionPolicy: { maxAttempts: 3 },
                    createdBy: "actor-1",
                    reviewedBy: "actor-2",
                    publishedAt: generatedAt,
                    createdAt: generatedAt,
                  },
                  latestVersion: null,
                },
              ],
            },
            executions: {
              total: 1,
              byStatus: { SUCCEEDED: 1 },
              unresolvedDeadLetters: 0,
              items: [
                {
                  id: "execution-1",
                  automationKey: "welcome-message",
                  automationVersion: 2,
                  status: "SUCCEEDED",
                  mode: "LIVE",
                  triggerReference: "event-1",
                  correlationId: "correlation-1",
                  causationId: null,
                  requestedBy: null,
                  startedAt: generatedAt,
                  finishedAt: generatedAt,
                  failureCode: null,
                  failureRetryable: null,
                  createdAt: generatedAt,
                  updatedAt: generatedAt,
                  steps: [],
                  deadLetter: null,
                },
              ],
            },
          })
        : undefined,
    );

    renderWithAuth(<KoralAutomationsPage />);

    expect(await screen.findByRole("heading", { name: "Automatizaciones" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Mensaje de bienvenida" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "welcome-message · v2" })).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes("hours=24&limit=20"))).toBe(true);
    expect(document.body.textContent).not.toContain("event payload");
  });

  it("offers an accessible retry after a sanitized analytics error", async () => {
    const user = userEvent.setup();
    let attempts = 0;
    mockAuthFetch(admin(), (url) => {
      if (!url.includes("/admin/koral/control-plane/analytics?")) return undefined;
      attempts += 1;
      if (attempts === 1) return response(500, { statusCode: 500, message: "unsafe internal detail" });
      return response(200, {
        generatedAt,
        window,
        conversations: { total: 0, byStatus: {} },
        events: { total: 0, byType: {} },
        processing: { total: 0, byStatus: {}, failuresByCode: {}, latencyMs: null },
        knowledgeRetrieval: { total: 0, byResult: {} },
        automations: { executions: { total: 0, byStatus: {} }, unresolvedDeadLetters: 0 },
        telemetry: {
          aiUsage: "STRUCTURED_LOG_AND_REDIS_DAILY_COUNTER",
          durableAiInvocationStore: false,
          durableTokenCostStore: false,
          promptContentRecorded: false,
        },
      });
    });

    renderWithAuth(<KoralAnalyticsPage />);

    expect(await screen.findByText("Ocurrió un problema en el servidor. Intenta nuevamente más tarde.")).toBeInTheDocument();
    expect(screen.queryByText("unsafe internal detail")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("Sin actividad en la ventana")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Cobertura de telemetría" })).toBeInTheDocument();
  });
});
