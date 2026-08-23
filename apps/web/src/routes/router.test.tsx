import { afterEach, describe, expect, it, vi } from "vitest";
import { isValidElement } from "react";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { routeConfig, routerFutureConfig } from "./router";
import { buildCurrentUser, mockAuthFetch, renderWithAuth } from "../test-utils/auth-test-helpers";
import type { CurrentUser } from "../lib/auth/auth-types";

function renderAtPath(
  path: string,
  currentUser: CurrentUser | null = null,
  additionalHandlers?: (url: string, init: RequestInit | undefined) => Promise<Response> | undefined,
) {
  mockAuthFetch(currentUser, additionalHandlers);
  const testRouter = createMemoryRouter(routeConfig, { initialEntries: [path], future: routerFutureConfig });
  return renderWithAuth(<RouterProvider router={testRouter} />);
}

function jsonResponse(status: number, body: unknown): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}

function systemSnapshot(overrides: Record<string, unknown> = {}) {
  const checked = "2026-08-20T12:00:00.000Z";
  const component = (state: string, criticality = "CORE") => ({ state, criticality, operationalImpact: "Lectura técnica.", latencyMs: 1, lastCheckedAt: checked });
  return {
    generatedAt: checked,
    core: { state: "HEALTHY", operationalImpact: "El núcleo administrativo está operativo." },
    api: { ...component("HEALTHY"), uptimeSeconds: 60, releaseSha: "sha", version: "1", migrationVersion: "m40" },
    services: { postgres: component("HEALTHY"), redis: component("HEALTHY") },
    integrations: { master: component("DISABLED", "OPTIONAL"), bold: { ...component("UNKNOWN", "OPTIONAL"), mode: "sandbox" }, smtp: { ...component("HEALTHY", "IMPORTANT"), configured: true } },
    security: { state: "HEALTHY", recoveryChannel: "CONFIGURED", mfaRequired: false },
    notifications: { queueState: "HEALTHY", transportState: "HEALTHY", transport: "SMTP", transportConfigured: true, backlog: 0, queued: 0, processing: 0, retryPending: 0, failed: 0, unknownResult: 0, deadLetter: 0 },
    ...overrides,
  };
}

function isLazyRouteElement(element: unknown): boolean {
  if (!isValidElement(element)) return false;
  const elementType = element.type as { $$typeof?: symbol };
  return elementType.$$typeof === Symbol.for("react.lazy");
}

/** A stateful fetch mock (mirrors LoginPage.test.tsx's mockLoginFlow): GET
 * /auth/me starts unauthenticated and flips to `user` only after a
 * successful POST /auth/login, matching the real backend's actual
 * before/after session state. */
function mockLoginFlow(user: CurrentUser) {
  let loggedIn = false;
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();

    if (url.includes("/auth/login")) {
      loggedIn = true;
      return jsonResponse(200, { user });
    }
    if (url.includes("/auth/me")) {
      return loggedIn ? jsonResponse(200, user) : jsonResponse(401, { statusCode: 401, error: "Unauthorized", message: "No autenticado." });
    }
    if (url.includes("/auth/refresh")) {
      return jsonResponse(401, { statusCode: 401, error: "Unauthorized", message: "No autenticado." });
    }
    // The /admin/pagos round-trip test below lands on a real page (not a
    // RoutePlaceholder) that issues a real paginated-list query - the
    // generic `{}` fallback below doesn't match that shape.
    if (url.includes("/admin/payment-orders/search")) {
      return jsonResponse(200, { items: [], total: 0, page: 1, pageSize: 20 });
    }
    return jsonResponse(200, {});
  });

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("router", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders PublicLayout's nav and footer for the home route", () => {
    renderAtPath("/");

    expect(screen.getByRole("navigation", { name: "Principal" })).toBeInTheDocument();
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Recibir orientación" })[0]).toHaveAttribute("href", "/comenzar");
  });

  it("loads secondary public and transactional features through route-level lazy boundaries", () => {
    const publicChildren = routeConfig[0]?.children ?? [];
    for (const path of ["quienes-somos", "beneficios", "contacto", "comenzar", "pqr", "solicitudes-de-datos"]) {
      const route = publicChildren.find((candidate) => candidate.path === path);
      expect(route, `missing route ${path}`).toBeDefined();
      expect(isLazyRouteElement(route?.element), `${path} should be lazy`).toBe(true);
    }
  });

  it("renders each top-level public marketing route inside PublicLayout", async () => {
    renderAtPath("/quienes-somos");
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(/ASODEF conecta personas/i);
    expect(screen.getByRole("navigation", { name: "Principal" })).toBeInTheDocument();
  });

  // Canonical public pages and preserved legacy redirects all land on
  // substantive editorial experiences inside the public shell.
  it.each([
    ["/quienes-somos", /ASODEF conecta personas/i],
    ["/beneficios", /Encuentra una opción para tu necesidad/i],
    ["/portafolio?utm_source=legacy", /Encuentra una opción para tu necesidad/i],
    ["/cobertura", /ASODEF conecta personas/i],
    ["/plan-exequial-familiar", /Plan exequial familiar/i],
    ["/contacto", /Qué necesitas hacer/i],
  ])("renders or safely redirects %s to substantive content", async (path, expectedHeading) => {
    renderAtPath(path);
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(expectedHeading);
    expect(screen.queryByText("Servicio no disponible")).not.toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Principal" })).toBeInTheDocument();
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
  });

  it("renders the complete public company journey at /empresas", async () => {
    renderAtPath("/empresas");
    expect(await screen.findByRole("heading", { level: 1, name: "Empresas" })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /acceso de empresas/i })[0]).toHaveAttribute("href", "/empresa/acceso");
  });

  it("renders AuthLayout with the common public menu for /iniciar-sesion", async () => {
    renderAtPath("/iniciar-sesion");

    expect(await screen.findByRole("heading", { name: "Acceso administrativo" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Principal" })).toBeInTheDocument();
    expect(screen.queryByRole("contentinfo")).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "ASODEF S.A.S." })).toBeInTheDocument();
  });

  it.each(["/", "/iniciar-sesion", "/pagos", "/mi-cuenta/acceso", "/empresa/acceso"])("uses the same principal menu on non-legal public route %s", async (path) => {
    renderAtPath(path);

    const nav = await screen.findByRole("navigation", { name: "Principal" });
    for (const label of ["Inicio", "Quiénes somos", "Beneficios", "Soluciones", "Empresas"]) {
      expect(nav).toHaveTextContent(label);
    }
    const actions = screen.getByLabelText("Acciones de navegación");
    expect(actions).toHaveTextContent(/Pagar.*Recibir orientación/);
  });

  it("uses the canonical public header throughout the Legal Center", async () => {
    renderAtPath("/legal");

    expect(await screen.findByRole("heading", { name: "Centro Legal ASODEF" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Principal" })).toBeInTheDocument();
    expect(screen.getByLabelText("Acciones de navegación")).toHaveTextContent(/Pagar.*Recibir orientación/);
    expect(screen.queryByText("Información institucional")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /volver al sitio/i })).not.toBeInTheDocument();
  });

  it("does not route a legacy external administrative session into self-service", async () => {
    renderAtPath("/iniciar-sesion", buildCurrentUser({ roles: ["CUSTOMER"] }));

    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(/Bienestar, respaldo y atención/i);
    expect(screen.queryByRole("heading", { name: "Acceso administrativo" })).not.toBeInTheDocument();
  });

  it("redirects an unauthenticated visitor to the affiliate identifier gateway", async () => {
    renderAtPath("/mi-cuenta/beneficiarios");

    expect(await screen.findByRole("heading", { name: "Acceso de afiliados" })).toBeInTheDocument();
    expect(screen.getByLabelText("Número de documento del titular")).toBeInTheDocument();
    expect(screen.queryByLabelText(/contraseña/i)).not.toBeInTheDocument();
  });

  it("keeps the company portal behind its independent NIT verification session", async () => {
    renderAtPath("/empresa/reportes", buildCurrentUser({ roles: ["COMPANY_PARTNER"] }));

    expect(await screen.findByRole("heading", { name: "Acceso de empresas" })).toBeInTheDocument();
    expect(screen.getByLabelText("NIT de la empresa")).toBeInTheDocument();
    expect(screen.queryByLabelText(/contraseña/i)).not.toBeInTheDocument();
  });

  it("renders the lazily-loaded AdminLayout with its distinct nav for /admin when the user holds ADMIN", async () => {
    renderAtPath("/admin", buildCurrentUser({ roles: ["ADMIN"] }));

    expect(await screen.findByRole("heading", { name: "Dashboard administrativo" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Administración" })).toBeInTheDocument();
  });

  it("shows ForbiddenPage for /admin when the authenticated user lacks SUPER_ADMIN/ADMIN", async () => {
    renderAtPath("/admin", buildCurrentUser({ roles: ["CUSTOMER"] }));

    expect(await screen.findByText("No tienes permisos para ver esta página")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Dashboard administrativo" })).not.toBeInTheDocument();
  });

  it("Example (AC): a FINANCE user with only payments.read can open /admin/pagos", async () => {
    renderAtPath("/admin/pagos", buildCurrentUser({ roles: ["FINANCE"], permissions: ["payments.read"] }));

    expect(await screen.findByRole("heading", { name: "Pagos" }, { timeout: 5_000 })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Administración" })).toBeInTheDocument();
  });

  it("Example (AC): that same FINANCE/payments.read-only user attempting /admin/usuarios shows the unauthorized state", async () => {
    renderAtPath("/admin/usuarios", buildCurrentUser({ roles: ["FINANCE"], permissions: ["payments.read"] }));

    expect(await screen.findByText("No tienes permisos para ver esta página")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Usuarios" })).not.toBeInTheDocument();
  });

  it("Negative case (AC): an unauthenticated request to /admin/pagos redirects to /iniciar-sesion and returns there after login", async () => {
    renderAtPath("/admin/pagos");

    expect(await screen.findByRole("heading", { name: "Acceso administrativo" })).toBeInTheDocument();
  });

  it("Negative case (AC), full login round-trip: after logging in from the preserved return location, actually lands back on /admin/pagos (not the default landing page)", async () => {
    // Regression guard for a real bug found while manually verifying this
    // AC in a live browser: GuestOnlyRoute (wrapping /iniciar-sesion) fires
    // its own Navigate the instant login flips isAuthenticated to true,
    // racing LoginPage's own post-login navigate() - and GuestOnlyRoute
    // used to ignore the preserved `from` location entirely, so whichever
    // one won the race silently dropped the return path. Isolated
    // LoginPage.test.tsx renders LoginPage without GuestOnlyRoute wrapping
    // it, so it never exercised this race; only a full-router composition
    // test like this one catches it.
    const financeUser = buildCurrentUser({ roles: ["FINANCE"], permissions: ["payments.read"] });
    mockLoginFlow(financeUser);
    const user = userEvent.setup();
    const testRouter = createMemoryRouter(routeConfig, { initialEntries: ["/admin/pagos"], future: routerFutureConfig });
    renderWithAuth(<RouterProvider router={testRouter} />);

    await screen.findByRole("heading", { name: "Acceso administrativo" });
    await user.type(screen.getByLabelText("Correo electrónico", { exact: false }), financeUser.email);
    await user.type(screen.getByLabelText("Contraseña", { exact: false, selector: "input" }), "correct-password");
    await user.click(screen.getByRole("button", { name: "Iniciar sesión" }));

    // Assert the routing contract directly. Waiting for the lazily rendered
    // payments heading made this navigation regression test depend on CPU
    // contention from the concurrent API suite in the canonical CI gate.
    await waitFor(() => expect(testRouter.state.location.pathname).toBe("/admin/pagos"));
  });

  it("hides nav sections the current user lacks permission for, without hiding always-visible sections (AC1)", async () => {
    renderAtPath("/admin", buildCurrentUser({ roles: ["FINANCE"], permissions: ["payments.read", "payments.reconcile", "reports.read", "audit.read"] }));

    await screen.findByRole("navigation", { name: "Administración" });
    expect(screen.getByRole("link", { name: "Pagos" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Conciliación" })).toBeInTheDocument();
    // Unimplemented placeholders are not advertised as operational
    // destinations in the canonical shell.
    for (const label of ["Planes", "Contratos", "Comunicaciones", "Aprobaciones"]) {
      expect(screen.queryByRole("link", { name: label })).not.toBeInTheDocument();
    }
    expect(screen.getByRole("link", { name: "Auditoría" })).toHaveAttribute("href", "/admin/auditoria");
    expect(screen.queryByRole("link", { name: "Usuarios" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Legal" })).not.toBeInTheDocument();
    // FINANCE deliberately holds no crm.read (rbac-catalog.spec.ts locks
    // it out of any CRM permission) - CRM stays hidden, same as any other
    // permission-gated section this role lacks.
    expect(screen.queryByRole("link", { name: "CRM" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Empresas y aliados" })).not.toBeInTheDocument();
  });

  it("groups administrative navigation and keeps Mi cuenta in the actor control", async () => {
    const user = userEvent.setup();
    renderAtPath("/admin", buildCurrentUser({ roles: ["SUPER_ADMIN"], permissions: ["crm.read", "payments.read", "payments.reconcile", "content.manage", "data.manage", "pqr.manage", "reports.read", "users.read", "audit.read", "settings.manage", "users.security.read", "users.sessions.read"] }));
    const nav = await screen.findByRole("navigation", { name: "Administración" });
    for (const group of ["Gestión", "Koral", "Comunicaciones", "Operación", "Cumplimiento", "Inteligencia", "Administración"]) expect(within(nav).getByRole("heading", { name: group })).toBeInTheDocument();
    expect(within(nav).queryByRole("link", { name: "Seguridad" })).not.toBeInTheDocument();
    expect(within(nav).queryByRole("link", { name: "Sesiones" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Abrir menú de Mi cuenta" }));
    for (const label of ["Mi cuenta", "Contraseña", "MFA", "Sesiones"]) expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
  });

  it("renders the current administrator session view through the existing user-scoped API", async () => {
    const user = userEvent.setup();
    let userDetailRequested = false;
    const currentUser = buildCurrentUser({
      id: "current-admin",
      email: "admin@asodef.test",
      roles: ["SUPER_ADMIN"],
      permissions: ["users.sessions.read", "users.sessions.revoke"],
    });
    renderAtPath("/admin/sesiones", currentUser, (url) => {
      if (url.endsWith("/admin/users/current-admin")) {
        userDetailRequested = true;
      }
      if (url.endsWith("/admin/users/current-admin/sessions")) return jsonResponse(200, []);
      return undefined;
    });

    expect(await screen.findByRole("heading", { name: "Sesiones de mi cuenta" })).toBeInTheDocument();
    expect(screen.getByText("Sin sesiones registradas")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Revocar otras sesiones" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Abrir menú de Mi cuenta" }));
    expect(screen.getByRole("link", { name: "Sesiones" })).toHaveAttribute("href", "/admin/mi-cuenta/sesiones");
    expect(userDetailRequested).toBe(false);
  });

  it("renders current-admin security events through the existing user-scoped API", async () => {
    const user = userEvent.setup();
    let userDetailRequested = false;
    const currentUser = buildCurrentUser({
      id: "current-admin",
      email: "admin@asodef.test",
      roles: ["SUPER_ADMIN"],
      permissions: ["users.security.read"],
    });
    renderAtPath("/admin/seguridad", currentUser, (url) => {
      if (url.endsWith("/admin/users/current-admin")) {
        userDetailRequested = true;
        return jsonResponse(200, {
          id: "current-admin",
          email: "admin@asodef.test",
          fullName: "Current Admin",
          status: "ACTIVE",
          roles: ["SUPER_ADMIN"],
          permissions: ["users.security.read"],
          createdAt: "2026-08-01T00:00:00.000Z",
          updatedAt: "2026-08-20T00:00:00.000Z",
          lastLoginAt: "2026-08-20T10:00:00.000Z",
          lockedUntil: null,
          isLocked: false,
          passwordChangedAt: "2026-08-01T00:00:00.000Z",
          activeSessionCount: 1,
        });
      }
      if (url.endsWith("/admin/users/stats")) {
        return jsonResponse(200, {
          totalUsers: 1,
          activeUsers: 1,
          inactiveUsers: 0,
          suspendedUsers: 0,
          lockedUsers: 0,
          recentLoginFailures24h: 0,
          activeSessions: 1,
        });
      }
      if (url.endsWith("/admin/users/current-admin/sessions")) return jsonResponse(200, []);
      if (url.endsWith("/admin/sistema")) {
        return jsonResponse(200, systemSnapshot());
      }
      if (url.includes("/admin/users/current-admin/security-events")) {
        return jsonResponse(200, { items: [], total: 0, page: 1, pageSize: 20 });
      }
      return undefined;
    });

    expect(await screen.findByRole("heading", { name: "Seguridad de mi cuenta" })).toBeInTheDocument();
    expect(screen.getByText("Sin eventos de seguridad registrados")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Abrir menú de Mi cuenta" }));
    expect(screen.getByRole("link", { name: "Mi cuenta" })).toHaveAttribute("href", "/admin/mi-cuenta/seguridad");
    expect(userDetailRequested).toBe(true);
  });

  it.each(["/admin/sesiones", "/admin/seguridad"])("keeps %s behind its explicit permission", async (path) => {
    renderAtPath(path, buildCurrentUser({ roles: ["ADMIN"], permissions: [] }));

    expect(await screen.findByText("No tienes permisos para ver esta página")).toBeInTheDocument();
  });

  it("renders the real system status page and navigation for settings.manage", async () => {
    renderAtPath(
      "/admin/sistema",
      buildCurrentUser({ roles: ["ADMIN"], permissions: ["settings.manage"] }),
      (url) => {
        if (url.endsWith("/admin/sistema")) {
          const unavailable = { state: "UNAVAILABLE", criticality: "CORE", operationalImpact: "No disponible.", latencyMs: 3_000, lastCheckedAt: "2026-08-19T18:00:00.000Z" };
          return jsonResponse(200, systemSnapshot({
            generatedAt: "2026-08-19T18:00:00.000Z",
            core: { state: "UNAVAILABLE", operationalImpact: "El núcleo administrativo no dispone de una dependencia esencial." },
            services: { postgres: { ...unavailable, state: "HEALTHY", latencyMs: 4 }, redis: unavailable },
            security: { state: "DEGRADED", recoveryChannel: "NOT_CONFIGURED", mfaRequired: false },
          }));
        }
        return undefined;
      },
    );

    expect(await screen.findByRole("heading", { name: "Sistema" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sistema" })).toHaveAttribute("href", "/admin/sistema");
    expect((await screen.findAllByText("No disponible")).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Deshabilitado").length).toBeGreaterThanOrEqual(1);
  });

  it("keeps /admin/sistema and its navigation entry behind settings.manage", async () => {
    renderAtPath("/admin/sistema", buildCurrentUser({ roles: ["ADMIN"], permissions: [] }));

    expect(await screen.findByText("No tienes permisos para ver esta página")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Sistema" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Sistema" })).not.toBeInTheDocument();
  });

  it.each([
    ["/admin/koral/inbox", "Inbox"],
    ["/admin/koral/conocimiento", "Conocimiento"],
    ["/admin/comunicaciones/plantillas", "Plantillas"],
  ])("renders the Control Plane foundation at %s with settings.manage", async (path, heading) => {
    renderAtPath(path, buildCurrentUser({ roles: ["SUPER_ADMIN"], permissions: ["settings.manage", "koral.conversations.read"] }));
    expect(await screen.findByRole("heading", { name: heading })).toBeInTheDocument();
    expect(screen.getAllByRole("alert").length).toBeGreaterThan(0);
  });

  it.each(["/admin/koral/inbox", "/admin/comunicaciones/plantillas"])(
    "keeps %s and its navigation behind settings.manage",
    async (path) => {
      renderAtPath(path, buildCurrentUser({ roles: ["ADMIN"], permissions: [] }));
      expect(await screen.findByText("No tienes permisos para ver esta página")).toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "Koral" })).not.toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "Comunicaciones" })).not.toBeInTheDocument();
    },
  );

  it("uses the canonical plans.read permission and real Plans API", async () => {
    renderAtPath(
      "/admin/planes",
      buildCurrentUser({ roles: ["COMMERCIAL"], permissions: ["plans.read"] }),
      (url) => url.includes("/admin/plans") ? jsonResponse(200, []) : undefined,
    );
    expect(await screen.findByRole("heading", { name: "Planes" })).toBeInTheDocument();
    expect(await screen.findByText("Aún no hay planes")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Planes" })).toBeInTheDocument();
  });

  it("does not infer Plans access from settings.manage", async () => {
    renderAtPath("/admin/planes", buildCurrentUser({ roles: ["SUPER_ADMIN"], permissions: ["settings.manage"] }));
    expect(await screen.findByText("No tienes permisos para ver esta página")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Planes" })).not.toBeInTheDocument();
  });

  it("uses Agent 1's canonical read permission for conversations and Inbox", async () => {
    renderAtPath(
      "/admin/koral/inbox",
      buildCurrentUser({
        roles: ["CUSTOMER_SERVICE"],
        permissions: ["koral.conversations.read"],
      }),
    );
    expect(await screen.findByRole("heading", { name: "Inbox" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Conversaciones" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Inbox" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Herramientas" })).not.toBeInTheDocument();
  });

  it("does not infer conversation access from settings.manage", async () => {
    renderAtPath(
      "/admin/koral/inbox",
      buildCurrentUser({
        roles: ["SUPER_ADMIN"],
        permissions: ["settings.manage"],
      }),
    );
    expect(await screen.findByText("No tienes permisos para ver esta página")).toBeInTheDocument();
  });

  it("renders the real audit timeline for audit.read and hides it without permission", async () => {
    renderAtPath(
      "/admin/auditoria",
      buildCurrentUser({ roles: ["AUDITOR"], permissions: ["audit.read"] }),
      (url) => url.includes("/admin/auditoria?")
        ? jsonResponse(200, { items: [], total: 0, pageSize: 20, nextCursor: null })
        : undefined,
    );
    expect(await screen.findByRole("heading", { name: "Auditoría" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Auditoría" })).toHaveAttribute("href", "/admin/auditoria");
  });

  it("keeps /admin/auditoria and its navigation entry behind audit.read", async () => {
    renderAtPath("/admin/auditoria", buildCurrentUser({ roles: ["ADMIN"], permissions: [] }));
    expect(await screen.findByText("No tienes permisos para ver esta página")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Auditoría" })).not.toBeInTheDocument();
  });

  it("Example (AC): a COMMERCIAL user with crm.read but not crm.manage can open the CRM section, read-only", async () => {
    renderAtPath("/admin/crm/prospectos", buildCurrentUser({ roles: ["COMMERCIAL"], permissions: ["crm.read"] }), (url) => {
      if (url.includes("/admin/prospects")) return jsonResponse(200, { items: [], total: 0, page: 1, pageSize: 20 });
      if (url.includes("/admin/leads")) return jsonResponse(200, { items: [], total: 0, page: 1, pageSize: 20 });
      return undefined;
    });

    expect(await screen.findByText("Modo de solo lectura: no tienes permiso para modificar registros de CRM.")).toBeInTheDocument();
  });

  it("Negative case (AC): a user without crm.read (e.g. FINANCE) is shown the unauthorized state for /admin/crm", async () => {
    renderAtPath("/admin/crm", buildCurrentUser({ roles: ["FINANCE"], permissions: ["payments.read"] }));

    expect(await screen.findByText("No tienes permisos para ver esta página")).toBeInTheDocument();
  });

  it("US-062: a user with content.manage (but not legal.approve) can open /admin/legal", async () => {
    renderAtPath("/admin/legal", buildCurrentUser({ roles: ["ADMIN"], permissions: ["content.manage"] }), (url) => {
      if (url.includes("/admin/legal-documents")) return jsonResponse(200, []);
      return undefined;
    });

    expect(await screen.findByRole("heading", { name: "Legal" })).toBeInTheDocument();
  });

  it("US-062: a user with data.manage can open /admin/consentimientos", async () => {
    renderAtPath("/admin/consentimientos", buildCurrentUser({ roles: ["CUSTOMER_SERVICE"], permissions: ["data.manage"] }), (url) => {
      if (url.includes("/admin/consent-records")) return jsonResponse(200, { items: [], total: 0, page: 1, pageSize: 20 });
      return undefined;
    });

    expect(await screen.findByRole("heading", { name: "Consentimientos" })).toBeInTheDocument();
  });

  it("Negative case (AC): a user without content.manage/data.manage is shown the unauthorized state for /admin/legal and /admin/consentimientos", async () => {
    renderAtPath("/admin/legal", buildCurrentUser({ roles: ["FINANCE"], permissions: ["payments.read"] }));
    expect(await screen.findByText("No tienes permisos para ver esta página")).toBeInTheDocument();
  });

  it("renders the real UserListPage for /admin/usuarios when the actor holds users.read", async () => {
    renderAtPath(
      "/admin/usuarios",
      buildCurrentUser({ roles: ["ADMIN"], permissions: ["users.read", "users.create"] }),
      (url) => {
        if (url.includes("/admin/users")) return jsonResponse(200, { items: [], total: 0, page: 1, pageSize: 20 });
        return undefined;
      },
    );

    expect(await screen.findByRole("heading", { name: "Usuarios" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Administración" })).toBeInTheDocument();
  });

  it("shows ForbiddenPage for /admin/usuarios when the actor lacks users.read (permission-based navigation, not just role-based)", async () => {
    renderAtPath("/admin/usuarios", buildCurrentUser({ roles: ["ADMIN"], permissions: [] }));

    expect(await screen.findByText("No tienes permisos para ver esta página")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Usuarios" })).not.toBeInTheDocument();
  });

  it("shows ForbiddenPage for /admin/usuarios/nuevo when the actor holds users.read but not users.create", async () => {
    renderAtPath("/admin/usuarios/nuevo", buildCurrentUser({ roles: ["ADMIN"], permissions: ["users.read"] }));

    expect(await screen.findByText("No tienes permisos para ver esta página")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Nuevo usuario" })).not.toBeInTheDocument();
  });

  it("renders the lazily-loaded LegalLayout with its document list for /legal/politica-de-privacidad", async () => {
    renderAtPath("/legal/politica-de-privacidad", null, (url) => {
      if (url.includes("/legal-documents/")) return jsonResponse(404, { statusCode: 404, error: "Not Found", message: "No encontrado." });
      return undefined;
    });

    expect(await screen.findByRole("heading", { name: "Política de privacidad" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Documentos legales" })).toBeInTheDocument();
    expect(await screen.findByText("Documento no disponible")).toBeInTheDocument();
  });

  it("renders /pqr as the canonical specialized workflow", async () => {
    renderAtPath("/pqr", null, (url) => {
      if (url.includes("/legal-documents/")) return jsonResponse(404, { statusCode: 404, error: "Not Found", message: "No encontrado." });
      return undefined;
    });
    expect(await screen.findByRole("heading", { name: "Radica o consulta una PQR" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Radicar una PQR" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Principal" })).toBeInTheDocument();
  });

  it("renders the 404 page (inside PublicLayout) for any unmatched path", async () => {
    renderAtPath("/esta-ruta-no-existe");

    expect(await screen.findByText("Página no encontrada")).toBeInTheDocument();
    // still within the public site chrome, not a bare unstyled fallback
    expect(screen.getByRole("navigation", { name: "Principal" })).toBeInTheDocument();
  });

  it("does not let the public catch-all shadow a self-service access route", async () => {
    // regression guard: PublicLayout's "*" child must not shadow more
    // specific routes defined in later top-level route groups
    renderAtPath("/empresa/acceso");
    expect(await screen.findByRole("heading", { name: "Acceso de empresas" })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("Página no encontrada")).not.toBeInTheDocument());
  });
});
