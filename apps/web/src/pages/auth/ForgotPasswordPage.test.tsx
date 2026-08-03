import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { ForgotPasswordPage } from "./ForgotPasswordPage";
import { renderWithAuth } from "../../test-utils/auth-test-helpers";

const GENERIC_SUCCESS_MESSAGE = "Si la cuenta existe, enviaremos las instrucciones para recuperar la contraseña.";

function jsonResponse(status: number, body: unknown): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}

function renderForgotPasswordPage() {
  return renderWithAuth(
    <MemoryRouter initialEntries={["/recuperar-clave"]}>
      <ForgotPasswordPage />
    </MemoryRouter>,
  );
}

describe("ForgotPasswordPage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the form with an email field and a link back to login", () => {
    vi.stubGlobal("fetch", vi.fn(() => jsonResponse(401, {})));
    renderForgotPasswordPage();

    expect(screen.getByRole("heading", { name: "Recuperar clave" })).toBeInTheDocument();
    expect(screen.getByLabelText("Correo electrónico", { exact: false })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Volver a iniciar sesión" })).toHaveAttribute("href", "/iniciar-sesion");
  });

  it("shows the identical fixed success message for an existing account", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/auth/forgot-password")) return jsonResponse(200, { message: GENERIC_SUCCESS_MESSAGE });
      return jsonResponse(401, {});
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderForgotPasswordPage();

    await user.type(screen.getByLabelText("Correo electrónico", { exact: false }), "existing@example.com");
    await user.click(screen.getByRole("button", { name: "Enviar instrucciones" }));

    expect(await screen.findByRole("status")).toHaveTextContent(GENERIC_SUCCESS_MESSAGE);
  });

  it("shows the identical fixed success message for an unknown account (no account enumeration)", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/auth/forgot-password")) return jsonResponse(200, { message: GENERIC_SUCCESS_MESSAGE });
      return jsonResponse(401, {});
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderForgotPasswordPage();

    await user.type(screen.getByLabelText("Correo electrónico", { exact: false }), "nobody@example.com");
    await user.click(screen.getByRole("button", { name: "Enviar instrucciones" }));

    expect(await screen.findByRole("status")).toHaveTextContent(GENERIC_SUCCESS_MESSAGE);
  });

  it("never reveals a rate-limit condition - the backend already silently no-ops it, and the frontend still shows the generic message", async () => {
    // The real backend never returns an error for forgot-password rate
    // limiting (it always 200s with the same message) - simulating that
    // exact contract here.
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/auth/forgot-password")) return jsonResponse(200, { message: GENERIC_SUCCESS_MESSAGE });
      return jsonResponse(401, {});
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderForgotPasswordPage();

    await user.type(screen.getByLabelText("Correo electrónico", { exact: false }), "rate-limited@example.com");
    await user.click(screen.getByRole("button", { name: "Enviar instrucciones" }));

    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent(GENERIC_SUCCESS_MESSAGE);
    expect(status.textContent).not.toMatch(/límite|rate|bloquead/i);
  });

  it("prevents duplicate submissions while pending", async () => {
    let resolveRequest!: (response: Response) => void;
    const pending = new Promise<Response>((resolve) => {
      resolveRequest = resolve;
    });
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/auth/forgot-password")) return pending;
      return jsonResponse(401, {});
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderForgotPasswordPage();

    await user.type(screen.getByLabelText("Correo electrónico", { exact: false }), "user@example.com");
    const submitButton = screen.getByRole("button", { name: "Enviar instrucciones" });
    await user.click(submitButton);
    await user.click(submitButton);
    await user.click(submitButton);

    resolveRequest(await jsonResponse(200, { message: GENERIC_SUCCESS_MESSAGE }));

    const calls = fetchMock.mock.calls.filter(([input]) => String(input).includes("/auth/forgot-password"));
    expect(calls).toHaveLength(1);
  });

  it("provides a safe retry experience after a successful submission", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/auth/forgot-password")) return jsonResponse(200, { message: GENERIC_SUCCESS_MESSAGE });
      return jsonResponse(401, {});
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderForgotPasswordPage();

    await user.type(screen.getByLabelText("Correo electrónico", { exact: false }), "user@example.com");
    await user.click(screen.getByRole("button", { name: "Enviar instrucciones" }));
    await screen.findByRole("status");

    await user.click(screen.getByRole("button", { name: "Enviar de nuevo" }));

    expect(screen.getByLabelText("Correo electrónico", { exact: false })).toBeInTheDocument();
  });

  it("shows a safe, distinct message on a genuine network/server failure, never the success state", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))));
    const user = userEvent.setup();
    renderForgotPasswordPage();

    await user.type(screen.getByLabelText("Correo electrónico", { exact: false }), "user@example.com");
    await user.click(screen.getByRole("button", { name: "Enviar instrucciones" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).not.toBe(GENERIC_SUCCESS_MESSAGE);
  });

  it("rejects an invalid email format before submission", async () => {
    const fetchMock = vi.fn((_input: RequestInfo | URL) => jsonResponse(401, {}));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderForgotPasswordPage();

    await user.type(screen.getByLabelText("Correo electrónico", { exact: false }), "not-an-email");
    await user.click(screen.getByRole("button", { name: "Enviar instrucciones" }));

    expect(await screen.findByText("Ingresa un correo electrónico válido.")).toBeInTheDocument();
    const calls = fetchMock.mock.calls.filter(([input]) => String(input).includes("/auth/forgot-password"));
    expect(calls).toHaveLength(0);
  });

  it("moves focus to the success message once it appears", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/auth/forgot-password")) return jsonResponse(200, { message: GENERIC_SUCCESS_MESSAGE });
      return jsonResponse(401, {});
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderForgotPasswordPage();

    await user.type(screen.getByLabelText("Correo electrónico", { exact: false }), "user@example.com");
    await user.click(screen.getByRole("button", { name: "Enviar instrucciones" }));

    const status = await screen.findByRole("status");
    await waitFor(() => expect(status.closest('[tabindex="-1"]')).toHaveFocus());
  });
});
