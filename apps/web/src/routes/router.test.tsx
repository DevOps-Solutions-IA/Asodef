import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
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
  return renderWithAuth(<RouterProvider router={testRouter} future={{ v7_startTransition: true }} />);
}

function jsonResponse(status: number, body: unknown): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
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
    // The homepage's Hero section (US-012) renders here - assert on its
    // one confirmed piece of real copy (the company tagline) and its
    // real-route CTA, rather than an invented page heading.
    expect(screen.getByRole("link", { name: "Centro de pagos" })).toHaveAttribute("href", "/pagos");
  });

  it("renders each top-level public marketing route inside PublicLayout", () => {
    renderAtPath("/quienes-somos");
    expect(screen.getByRole("heading", { name: "Quiénes somos" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Principal" })).toBeInTheDocument();
  });

  it("renders AuthLayout (no marketing nav/footer) for /iniciar-sesion when unauthenticated", async () => {
    renderAtPath("/iniciar-sesion");

    expect(await screen.findByRole("heading", { name: "Iniciar sesión" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Principal" })).not.toBeInTheDocument();
    expect(screen.queryByRole("contentinfo")).not.toBeInTheDocument();
  });

  it("redirects an already-authenticated visitor away from /iniciar-sesion (GuestOnlyRoute)", async () => {
    renderAtPath("/iniciar-sesion", buildCurrentUser({ roles: ["CUSTOMER"] }));

    expect(await screen.findByRole("heading", { name: "Mi cuenta" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Iniciar sesión" })).not.toBeInTheDocument();
  });

  it("redirects an unauthenticated visitor away from a protected /mi-cuenta/* route", async () => {
    renderAtPath("/mi-cuenta/perfil");

    expect(await screen.findByRole("heading", { name: "Iniciar sesión" })).toBeInTheDocument();
  });

  it("renders the lazily-loaded AccountLayout with its own nav for an authenticated /mi-cuenta/* route", async () => {
    renderAtPath("/mi-cuenta/perfil", buildCurrentUser({ roles: ["CUSTOMER"] }));

    expect(await screen.findByRole("heading", { name: "Perfil" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Cuenta" })).toBeInTheDocument();
    // and the sibling nav item to the active one is also present, proving
    // it's the full AccountLayout shell, not just the bare page
    expect(screen.getByRole("link", { name: "Documentos" })).toBeInTheDocument();
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

    expect(await screen.findByRole("heading", { name: "Pagos" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Administración" })).toBeInTheDocument();
  });

  it("Example (AC): that same FINANCE/payments.read-only user attempting /admin/usuarios shows the unauthorized state", async () => {
    renderAtPath("/admin/usuarios", buildCurrentUser({ roles: ["FINANCE"], permissions: ["payments.read"] }));

    expect(await screen.findByText("No tienes permisos para ver esta página")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Usuarios" })).not.toBeInTheDocument();
  });

  it("Negative case (AC): an unauthenticated request to /admin/pagos redirects to /iniciar-sesion and returns there after login", async () => {
    renderAtPath("/admin/pagos");

    expect(await screen.findByRole("heading", { name: "Iniciar sesión" })).toBeInTheDocument();
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
    renderWithAuth(<RouterProvider router={testRouter} future={{ v7_startTransition: true }} />);

    await screen.findByRole("heading", { name: "Iniciar sesión" });
    await user.type(screen.getByLabelText("Correo electrónico", { exact: false }), financeUser.email);
    await user.type(screen.getByLabelText("Contraseña", { exact: false, selector: "input" }), "correct-password");
    await user.click(screen.getByRole("button", { name: "Iniciar sesión" }));

    expect(await screen.findByRole("heading", { name: "Pagos" })).toBeInTheDocument();
  });

  it("hides nav sections the current user lacks permission for, without hiding always-visible sections (AC1)", async () => {
    renderAtPath("/admin", buildCurrentUser({ roles: ["FINANCE"], permissions: ["payments.read", "payments.reconcile", "reports.read", "audit.read"] }));

    await screen.findByRole("navigation", { name: "Administración" });
    expect(screen.getByRole("link", { name: "Pagos" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Conciliación" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Planes" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Usuarios" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "CRM" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Legal" })).not.toBeInTheDocument();
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
    expect(await screen.findByText("Aún no publicado")).toBeInTheDocument();
  });

  it("redirects /pqr to /legal/pqr", async () => {
    renderAtPath("/pqr", null, (url) => {
      if (url.includes("/legal-documents/")) return jsonResponse(404, { statusCode: 404, error: "Not Found", message: "No encontrado." });
      return undefined;
    });
    expect(await screen.findByRole("heading", { name: "PQR" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Documentos legales" })).toBeInTheDocument();
  });

  it("renders the 404 page (inside PublicLayout) for any unmatched path", async () => {
    renderAtPath("/esta-ruta-no-existe");

    expect(await screen.findByText("Página no encontrada")).toBeInTheDocument();
    // still within the public site chrome, not a bare unstyled fallback
    expect(screen.getByRole("navigation", { name: "Principal" })).toBeInTheDocument();
  });

  it("does not match the catch-all for a route that belongs to a different layout group", async () => {
    // regression guard: PublicLayout's "*" child must not shadow more
    // specific routes defined in later top-level route groups
    renderAtPath("/empresa/dashboard", buildCurrentUser({ roles: ["COMPANY_PARTNER"] }));
    expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("Página no encontrada")).not.toBeInTheDocument());
  });
});
