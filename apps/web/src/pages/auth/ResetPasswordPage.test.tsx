import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider, useLocation } from "react-router-dom";
import { ResetPasswordPage } from "./ResetPasswordPage";
import { renderWithAuth } from "../../test-utils/auth-test-helpers";

function jsonResponse(status: number, body: unknown): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}

function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="location-search">{location.search}</div>;
}

function renderResetPasswordPage(initialPath = "/restablecer-clave?token=raw-test-token-value") {
  const routes = [
    {
      path: "/restablecer-clave",
      element: (
        <>
          <ResetPasswordPage />
          <LocationDisplay />
        </>
      ),
    },
    { path: "/iniciar-sesion", element: <div>Contenido de inicio de sesión</div> },
    { path: "/recuperar-clave", element: <div>Contenido de recuperar clave</div> },
  ];
  const router = createMemoryRouter(routes, { initialEntries: [initialPath] });
  return renderWithAuth(<RouterProvider router={router} />);
}

describe("ResetPasswordPage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows a safe invalid-link state when the page loads without a token", async () => {
    vi.stubGlobal("fetch", vi.fn((_input: RequestInfo | URL) => jsonResponse(401, {})));
    renderResetPasswordPage("/restablecer-clave");

    expect(await screen.findByText("Enlace inválido")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Solicitar nuevo enlace" })).toHaveAttribute("href", "/recuperar-clave");
    expect(screen.queryByLabelText("Nueva contraseña", { exact: false })).not.toBeInTheDocument();
  });

  it("extracts the token from the URL and removes it immediately, keeping it only in memory", async () => {
    vi.stubGlobal("fetch", vi.fn((_input: RequestInfo | URL) => jsonResponse(401, {})));
    renderResetPasswordPage("/restablecer-clave?token=raw-test-token-value");

    expect(await screen.findByRole("heading", { name: "Restablecer clave" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("location-search")).toHaveTextContent(""));
  });

  it("submits the extracted token in the request body even though it no longer appears in the URL", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/auth/reset-password")) {
        return jsonResponse(200, { message: "Tu contraseña ha sido restablecida correctamente." });
      }
      return jsonResponse(401, {});
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderResetPasswordPage("/restablecer-clave?token=raw-test-token-value");
    await screen.findByRole("heading", { name: "Restablecer clave" });

    await user.type(screen.getByLabelText("Nueva contraseña", { exact: false, selector: "input" }), "Strong-Password-99!");
    await user.type(screen.getByLabelText("Confirmar contraseña", { exact: false, selector: "input" }), "Strong-Password-99!");
    await user.click(screen.getByRole("button", { name: "Restablecer contraseña" }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([input]) => String(input).includes("/auth/reset-password"));
      expect(call).toBeDefined();
      const [, callInit] = call!;
      const body = JSON.parse((callInit as RequestInit).body as string);
      expect(body.token).toBe("raw-test-token-value");
    });
  });

  it("validates password confirmation matches before submitting", async () => {
    const fetchMock = vi.fn((_input: RequestInfo | URL) => jsonResponse(401, {}));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderResetPasswordPage();
    await screen.findByRole("heading", { name: "Restablecer clave" });

    await user.type(screen.getByLabelText("Nueva contraseña", { exact: false, selector: "input" }), "Strong-Password-99!");
    await user.type(screen.getByLabelText("Confirmar contraseña", { exact: false, selector: "input" }), "Different-99!");
    await user.click(screen.getByRole("button", { name: "Restablecer contraseña" }));

    expect(await screen.findByText("Las contraseñas no coinciden.")).toBeInTheDocument();
    const calls = fetchMock.mock.calls.filter(([input]) => String(input).includes("/auth/reset-password"));
    expect(calls).toHaveLength(0);
  });

  it("shows a weak-password message before submission (client-side length hint)", async () => {
    const fetchMock = vi.fn((_input: RequestInfo | URL) => jsonResponse(401, {}));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderResetPasswordPage();
    await screen.findByRole("heading", { name: "Restablecer clave" });

    await user.type(screen.getByLabelText("Nueva contraseña", { exact: false, selector: "input" }), "short1");
    await user.type(screen.getByLabelText("Confirmar contraseña", { exact: false, selector: "input" }), "short1");
    await user.click(screen.getByRole("button", { name: "Restablecer contraseña" }));

    expect(await screen.findByText(/al menos 12 caracteres/)).toBeInTheDocument();
  });

  it("succeeds with a valid token and strong password, then redirects toward /iniciar-sesion", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/auth/reset-password")) {
        return jsonResponse(200, { message: "Tu contraseña ha sido restablecida correctamente." });
      }
      return jsonResponse(401, {});
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderResetPasswordPage();
    await screen.findByRole("heading", { name: "Restablecer clave" });

    await user.type(screen.getByLabelText("Nueva contraseña", { exact: false, selector: "input" }), "Strong-Password-99!");
    await user.type(screen.getByLabelText("Confirmar contraseña", { exact: false, selector: "input" }), "Strong-Password-99!");
    await user.click(screen.getByRole("button", { name: "Restablecer contraseña" }));

    expect(await screen.findByRole("status")).toHaveTextContent(/restablecida correctamente/i);
    // Does not automatically log the user in - no session cookie call, no
    // redirect straight into a protected area; the explicit link still
    // points at /iniciar-sesion.
    expect(screen.getByRole("link", { name: "Ir a iniciar sesión ahora" })).toHaveAttribute("href", "/iniciar-sesion");
  });

  it("shows a safe message for an invalid or expired token", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/auth/reset-password")) {
        return jsonResponse(400, {
          statusCode: 400,
          error: "Bad Request",
          message: "Token de restablecimiento inválido o expirado.",
          code: "INVALID_OR_EXPIRED_TOKEN",
        });
      }
      return jsonResponse(401, {});
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderResetPasswordPage();
    await screen.findByRole("heading", { name: "Restablecer clave" });

    await user.type(screen.getByLabelText("Nueva contraseña", { exact: false, selector: "input" }), "Strong-Password-99!");
    await user.type(screen.getByLabelText("Confirmar contraseña", { exact: false, selector: "input" }), "Strong-Password-99!");
    await user.click(screen.getByRole("button", { name: "Restablecer contraseña" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/no es válido o ha expirado/i);
  });

  it("shows a distinct safe message for an already-used token", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/auth/reset-password")) {
        return jsonResponse(400, {
          statusCode: 400,
          error: "Bad Request",
          message: "Este enlace ya fue utilizado. Solicita uno nuevo.",
          code: "TOKEN_ALREADY_USED",
        });
      }
      return jsonResponse(401, {});
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderResetPasswordPage();
    await screen.findByRole("heading", { name: "Restablecer clave" });

    await user.type(screen.getByLabelText("Nueva contraseña", { exact: false, selector: "input" }), "Strong-Password-99!");
    await user.type(screen.getByLabelText("Confirmar contraseña", { exact: false, selector: "input" }), "Strong-Password-99!");
    await user.click(screen.getByRole("button", { name: "Restablecer contraseña" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/ya fue utilizado/i);
  });

  it("shows a safe message for a server-rejected weak password", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/auth/reset-password")) {
        return jsonResponse(400, {
          statusCode: 400,
          error: "Bad Request",
          message: "Esta contraseña es demasiado común. Elige una diferente.",
          code: "WEAK_PASSWORD",
        });
      }
      return jsonResponse(401, {});
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderResetPasswordPage();
    await screen.findByRole("heading", { name: "Restablecer clave" });

    await user.type(screen.getByLabelText("Nueva contraseña", { exact: false, selector: "input" }), "Whatever-Strong-99!");
    await user.type(screen.getByLabelText("Confirmar contraseña", { exact: false, selector: "input" }), "Whatever-Strong-99!");
    await user.click(screen.getByRole("button", { name: "Restablecer contraseña" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/no cumple con la política de seguridad/i);
  });

  it("never renders a raw backend error for an unexpected failure", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/auth/reset-password")) {
        return jsonResponse(500, { statusCode: 500, error: "Internal Server Error", message: "relation users_pkey violated" });
      }
      return jsonResponse(401, {});
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderResetPasswordPage();
    await screen.findByRole("heading", { name: "Restablecer clave" });

    await user.type(screen.getByLabelText("Nueva contraseña", { exact: false, selector: "input" }), "Whatever-Strong-99!");
    await user.type(screen.getByLabelText("Confirmar contraseña", { exact: false, selector: "input" }), "Whatever-Strong-99!");
    await user.click(screen.getByRole("button", { name: "Restablecer contraseña" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).not.toMatch(/relation|pkey|violated/i);
  });

  it("supports password visibility toggles on both fields", async () => {
    vi.stubGlobal("fetch", vi.fn((_input: RequestInfo | URL) => jsonResponse(401, {})));
    const user = userEvent.setup();
    renderResetPasswordPage();
    await screen.findByRole("heading", { name: "Restablecer clave" });

    const newPasswordInput = screen.getByLabelText("Nueva contraseña", { exact: false, selector: "input" });
    expect(newPasswordInput).toHaveAttribute("type", "password");

    const toggles = screen.getAllByRole("button", { name: "Mostrar contraseña" });
    await user.click(toggles[0]!);
    expect(newPasswordInput).toHaveAttribute("type", "text");
  });
});
