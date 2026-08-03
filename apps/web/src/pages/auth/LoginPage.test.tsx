import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { LoginPage } from "./LoginPage";
import { renderWithAuth } from "../../test-utils/auth-test-helpers";
import type { CurrentUser } from "../../lib/auth/auth-types";

function jsonResponse(status: number, body: unknown): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}

function buildCurrentUser(roles: string[]): CurrentUser {
  return {
    id: "user-1",
    email: "user@example.com",
    fullName: "Test User",
    status: "ACTIVE",
    roles,
    permissions: [],
    session: { createdAt: "2026-01-01T00:00:00.000Z", lastUsedAt: "2026-01-01T00:00:00.000Z" },
  };
}

interface LoginFetchOptions {
  loginOutcome: "success" | "invalid" | "rate-limited";
  roles?: string[];
}

/** A stateful fetch mock: /auth/me starts unauthenticated, and flips to
 * authenticated only after a successful POST /auth/login - mirroring the
 * real backend's actual before/after session state. */
function mockLoginFlow({ loginOutcome, roles = [] }: LoginFetchOptions) {
  let loggedIn = false;
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();

    if (url.includes("/auth/login")) {
      if (loginOutcome === "success") {
        loggedIn = true;
        return jsonResponse(200, { user: buildCurrentUser(roles) });
      }
      if (loginOutcome === "rate-limited") {
        return jsonResponse(429, {
          statusCode: 429,
          error: "Too Many Requests",
          message: "Demasiados intentos. Intenta nuevamente más tarde.",
          retryAfterSeconds: 30,
        });
      }
      return jsonResponse(401, { statusCode: 401, error: "Unauthorized", message: "Credenciales inválidas." });
    }

    if (url.includes("/auth/me")) {
      return loggedIn
        ? jsonResponse(200, buildCurrentUser(roles))
        : jsonResponse(401, { statusCode: 401, error: "Unauthorized", message: "No autenticado." });
    }

    return jsonResponse(200, {});
  });

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

type MemoryEntry = string | { pathname: string; state?: unknown };

function renderLoginPage(initialEntries: MemoryEntry[] = ["/iniciar-sesion"]) {
  const routes = [
    { path: "/iniciar-sesion", element: <LoginPage /> },
    { path: "/mi-cuenta", element: <div>Contenido de mi cuenta</div> },
    { path: "/admin", element: <div>Contenido de administración</div> },
    { path: "/empresa", element: <div>Contenido de empresa</div> },
    { path: "/mi-cuenta/pagos", element: <div>Contenido de pagos</div> },
  ];
  const router = createMemoryRouter(routes, { initialEntries });
  return renderWithAuth(<RouterProvider router={router} />);
}

describe("LoginPage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the login form with email and password fields", async () => {
    mockLoginFlow({ loginOutcome: "invalid" });
    renderLoginPage();

    expect(await screen.findByRole("heading", { name: "Iniciar sesión" })).toBeInTheDocument();
    expect(screen.getByLabelText("Correo electrónico", { exact: false })).toBeInTheDocument();
    expect(screen.getByLabelText("Contraseña", { exact: false, selector: "input" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Iniciar sesión" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "¿Olvidaste tu contraseña?" })).toHaveAttribute("href", "/recuperar-clave");
  });

  it("shows validation errors for empty fields without calling the API", async () => {
    const fetchMock = mockLoginFlow({ loginOutcome: "invalid" });
    const user = userEvent.setup();
    renderLoginPage();
    await screen.findByRole("heading", { name: "Iniciar sesión" });
    fetchMock.mockClear();

    await user.click(screen.getByRole("button", { name: "Iniciar sesión" }));

    expect(await screen.findByText("El correo electrónico es requerido.")).toBeInTheDocument();
    expect(screen.getByText("La contraseña es requerida.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining("/auth/login"), expect.anything());
  });

  it("moves focus to the first invalid field after a validation failure", async () => {
    mockLoginFlow({ loginOutcome: "invalid" });
    const user = userEvent.setup();
    renderLoginPage();
    await screen.findByRole("heading", { name: "Iniciar sesión" });

    await user.click(screen.getByRole("button", { name: "Iniciar sesión" }));

    await waitFor(() => expect(screen.getByLabelText("Correo electrónico", { exact: false })).toHaveFocus());
  });

  it("rejects an invalid email format before submission", async () => {
    mockLoginFlow({ loginOutcome: "invalid" });
    const user = userEvent.setup();
    renderLoginPage();
    await screen.findByRole("heading", { name: "Iniciar sesión" });

    await user.type(screen.getByLabelText("Correo electrónico", { exact: false }), "not-an-email");
    await user.type(screen.getByLabelText("Contraseña", { exact: false, selector: "input" }), "whatever");
    await user.click(screen.getByRole("button", { name: "Iniciar sesión" }));

    expect(await screen.findByText("Ingresa un correo electrónico válido.")).toBeInTheDocument();
  });

  it("shows one generic invalid-credentials message on a 401, never revealing the specific reason", async () => {
    mockLoginFlow({ loginOutcome: "invalid" });
    const user = userEvent.setup();
    renderLoginPage();
    await screen.findByRole("heading", { name: "Iniciar sesión" });

    await user.type(screen.getByLabelText("Correo electrónico", { exact: false }), "user@example.com");
    await user.type(screen.getByLabelText("Contraseña", { exact: false, selector: "input" }), "wrong-password");
    await user.click(screen.getByRole("button", { name: "Iniciar sesión" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Credenciales inválidas.");
  });

  it("shows the identical message regardless of the underlying failure reason (generic error equivalence)", async () => {
    // Two separate renders, both 401 - the frontend cannot and does not
    // distinguish "unknown email" from "wrong password" from "locked"
    // etc., matching the backend's own anti-enumeration design.
    mockLoginFlow({ loginOutcome: "invalid" });
    const user = userEvent.setup();
    renderLoginPage();
    await screen.findByRole("heading", { name: "Iniciar sesión" });
    await user.type(screen.getByLabelText("Correo electrónico", { exact: false }), "unknown@example.com");
    await user.type(screen.getByLabelText("Contraseña", { exact: false, selector: "input" }), "whatever");
    await user.click(screen.getByRole("button", { name: "Iniciar sesión" }));
    const firstMessage = (await screen.findByRole("alert")).textContent;

    expect(firstMessage).toBe("Credenciales inválidas.");
  });

  it("shows a rate-limit message and disables the submit button while rate-limited", async () => {
    mockLoginFlow({ loginOutcome: "rate-limited" });
    const user = userEvent.setup();
    renderLoginPage();
    await screen.findByRole("heading", { name: "Iniciar sesión" });

    await user.type(screen.getByLabelText("Correo electrónico", { exact: false }), "user@example.com");
    await user.type(screen.getByLabelText("Contraseña", { exact: false, selector: "input" }), "whatever");
    await user.click(screen.getByRole("button", { name: "Iniciar sesión" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/demasiados intentos/i);
    expect(screen.getByRole("button", { name: "Iniciar sesión" })).toBeDisabled();
  });

  it("prevents duplicate submissions while a login request is pending", async () => {
    // A real (near-instant) response would let each sequential click fully
    // settle before the next one fires, which is not actually testing
    // concurrency. An artificial delay keeps the first request genuinely
    // pending while the next clicks happen, so the button's disabled
    // state has something real to guard against.
    let resolveLogin!: (response: Response) => void;
    const pendingLogin = new Promise<Response>((resolve) => {
      resolveLogin = resolve;
    });
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/auth/login")) return pendingLogin;
      if (url.includes("/auth/me")) return jsonResponse(401, { statusCode: 401, error: "Unauthorized" });
      return jsonResponse(200, {});
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    renderLoginPage();
    await screen.findByRole("heading", { name: "Iniciar sesión" });

    await user.type(screen.getByLabelText("Correo electrónico", { exact: false }), "user@example.com");
    await user.type(screen.getByLabelText("Contraseña", { exact: false, selector: "input" }), "whatever");
    const submitButton = screen.getByRole("button", { name: "Iniciar sesión" });

    await user.click(submitButton);
    // The button is now disabled/pending - further clicks must be no-ops.
    await user.click(submitButton);
    await user.click(submitButton);

    resolveLogin(await jsonResponse(401, { statusCode: 401, error: "Unauthorized", message: "Credenciales inválidas." }));

    const loginCalls = fetchMock.mock.calls.filter(([input]) => String(input).includes("/auth/login"));
    expect(loginCalls).toHaveLength(1);
  });

  it("redirects to the role-based landing page after a successful login with no return location", async () => {
    mockLoginFlow({ loginOutcome: "success", roles: ["ADMIN"] });
    const user = userEvent.setup();
    renderLoginPage();
    await screen.findByRole("heading", { name: "Iniciar sesión" });

    await user.type(screen.getByLabelText("Correo electrónico", { exact: false }), "admin@example.com");
    await user.type(screen.getByLabelText("Contraseña", { exact: false, selector: "input" }), "correct-password");
    await user.click(screen.getByRole("button", { name: "Iniciar sesión" }));

    expect(await screen.findByText("Contenido de administración")).toBeInTheDocument();
  });

  it("redirects to a safe preserved return location after login instead of the default landing page", async () => {
    mockLoginFlow({ loginOutcome: "success", roles: ["CUSTOMER"] });
    const user = userEvent.setup();
    renderLoginPage([{ pathname: "/iniciar-sesion", state: { from: "/mi-cuenta/pagos" } }]);
    await screen.findByRole("heading", { name: "Iniciar sesión" });

    await user.type(screen.getByLabelText("Correo electrónico", { exact: false }), "user@example.com");
    await user.type(screen.getByLabelText("Contraseña", { exact: false, selector: "input" }), "correct-password");
    await user.click(screen.getByRole("button", { name: "Iniciar sesión" }));

    expect(await screen.findByText("Contenido de pagos")).toBeInTheDocument();
  });

  it("rejects an unsafe external redirect target and falls back to the role-based landing page", async () => {
    mockLoginFlow({ loginOutcome: "success", roles: ["CUSTOMER"] });
    const user = userEvent.setup();
    renderLoginPage([{ pathname: "/iniciar-sesion", state: { from: "https://evil.example.com" } }]);
    await screen.findByRole("heading", { name: "Iniciar sesión" });

    await user.type(screen.getByLabelText("Correo electrónico", { exact: false }), "user@example.com");
    await user.type(screen.getByLabelText("Contraseña", { exact: false, selector: "input" }), "correct-password");
    await user.click(screen.getByRole("button", { name: "Iniciar sesión" }));

    expect(await screen.findByText("Contenido de mi cuenta")).toBeInTheDocument();
  });

  it("supports full keyboard-only completion of the form", async () => {
    mockLoginFlow({ loginOutcome: "success", roles: ["CUSTOMER"] });
    const user = userEvent.setup();
    renderLoginPage();
    await screen.findByRole("heading", { name: "Iniciar sesión" });

    await user.tab();
    expect(screen.getByLabelText("Correo electrónico", { exact: false })).toHaveFocus();
    await user.keyboard("user@example.com");
    await user.tab();
    expect(screen.getByLabelText("Contraseña", { exact: false, selector: "input" })).toHaveFocus();
    await user.keyboard("correct-password");

    // Tab order after the password field: visibility toggle, then the
    // "forgot password" link, then the submit button.
    await user.tab();
    expect(screen.getByRole("button", { name: "Mostrar contraseña" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("link", { name: "¿Olvidaste tu contraseña?" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Iniciar sesión" })).toHaveFocus();
    await user.keyboard("{Enter}");

    expect(await screen.findByText("Contenido de mi cuenta")).toBeInTheDocument();
  });

  it("announces the error message via an accessible alert region", async () => {
    mockLoginFlow({ loginOutcome: "invalid" });
    const user = userEvent.setup();
    renderLoginPage();
    await screen.findByRole("heading", { name: "Iniciar sesión" });

    await user.type(screen.getByLabelText("Correo electrónico", { exact: false }), "user@example.com");
    await user.type(screen.getByLabelText("Contraseña", { exact: false, selector: "input" }), "wrong");
    await user.click(screen.getByRole("button", { name: "Iniciar sesión" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toBeInTheDocument();
    // Focus lands on the focusable wrapper containing the alert (the
    // alert's own root div is not itself a focusable element).
    await waitFor(() => expect(alert.closest('[tabindex="-1"]')).toHaveFocus());
  });

  it("never renders a raw API error body", async () => {
    const fetchMock = vi.fn(() =>
      jsonResponse(500, { statusCode: 500, error: "Internal Server Error", message: "SQL error: relation does not exist" }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderLoginPage();
    await screen.findByRole("heading", { name: "Iniciar sesión" });

    await user.type(screen.getByLabelText("Correo electrónico", { exact: false }), "user@example.com");
    await user.type(screen.getByLabelText("Contraseña", { exact: false, selector: "input" }), "whatever");
    await user.click(screen.getByRole("button", { name: "Iniciar sesión" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).not.toMatch(/SQL|relation/i);
  });
});
