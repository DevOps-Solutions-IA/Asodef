import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdminMfaPanel } from "./AdminMfaPanel";

function response(body: unknown, status = 200): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}

function renderPanel() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}><AdminMfaPanel /></QueryClientProvider>);
}

describe("AdminMfaPanel", () => {
  afterEach(() => vi.restoreAllMocks());

  it("completes enrollment and shows recovery codes once behind explicit acknowledgment", async () => {
    let enrolled = false;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/auth/mfa/status")) {
        return response({ required: true, enrolled, status: enrolled ? "ACTIVE" : "NOT_ENROLLED", confirmedAt: enrolled ? new Date().toISOString() : null, recoveryCodesRemaining: enrolled ? 10 : 0 });
      }
      if (url.includes("/auth/mfa/enrollment/confirm")) {
        enrolled = true;
        return response({ recoveryCodes: ["AAAA-BBBB-CCCC", "DDDD-EEEE-FFFF"] });
      }
      if (url.endsWith("/auth/mfa/enrollment") && init?.method === "POST") {
        return response({ secret: "TESTBASE32SECRET", otpauthUri: "otpauth://totp/ASODEF:test", expiresAt: new Date(Date.now() + 600_000).toISOString() });
      }
      return response({}, 404);
    });
    vi.stubGlobal("fetch", fetchMock);
    const storageSpy = vi.spyOn(Storage.prototype, "setItem");
    const user = userEvent.setup();
    renderPanel();

    await user.type(await screen.findByLabelText("Contraseña actual", { exact: false }), "Administrative-Password-99!");
    await user.click(await screen.findByRole("button", { name: "Configurar MFA" }));
    expect(await screen.findByTestId("mfa-enrollment-secret")).toHaveTextContent("TESTBASE32SECRET");
    const confirmationPassword = screen.getByLabelText("Contraseña actual", { exact: false });
    expect(confirmationPassword).toHaveValue("");
    await user.type(confirmationPassword, "Administrative-Password-99!");
    await user.type(screen.getByLabelText("Código de 6 dígitos", { exact: false }), "123456");
    await user.click(screen.getByRole("button", { name: "Confirmar MFA" }));

    expect(await screen.findByText("AAAA-BBBB-CCCC")).toBeInTheDocument();
    const finish = screen.getByRole("button", { name: "Finalizar" });
    expect(finish).toBeDisabled();
    await user.click(screen.getByRole("checkbox"));
    expect(finish).toBeEnabled();
    await user.click(finish);
    expect(screen.queryByText("AAAA-BBBB-CCCC")).not.toBeInTheDocument();
    expect(storageSpy).not.toHaveBeenCalled();
    const beginRequest = fetchMock.mock.calls.find(([input]) => String(input).endsWith("/auth/mfa/enrollment"));
    const confirmRequest = fetchMock.mock.calls.find(([input]) => String(input).includes("/auth/mfa/enrollment/confirm"));
    expect(JSON.parse(String(beginRequest?.[1]?.body))).toEqual({ password: "Administrative-Password-99!" });
    expect(JSON.parse(String(confirmRequest?.[1]?.body))).toEqual({
      password: "Administrative-Password-99!",
      code: "123456",
    });
  });

  it("regenerates recovery codes only after password and MFA confirmation", async () => {
    let regenerateAttempts = 0;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/auth/mfa/status")) {
        return response({ required: true, enrolled: true, status: "ACTIVE", confirmedAt: new Date().toISOString(), recoveryCodesRemaining: 4 });
      }
      if (url.endsWith("/auth/step-up") && init?.method === "POST") {
        return response({ verifiedAt: new Date().toISOString() });
      }
      if (url.includes("/auth/mfa/recovery-codes/regenerate") && init?.method === "POST") {
        regenerateAttempts += 1;
        if (regenerateAttempts === 1) {
          return response({ statusCode: 403, error: "Forbidden", code: "STEP_UP_REQUIRED", message: "Se requiere autenticación reciente para realizar esta acción." }, 403);
        }
        return response({ recoveryCodes: ["1111-2222-3333"] });
      }
      return response({}, 404);
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderPanel();

    await user.click(await screen.findByRole("button", { name: "Regenerar códigos" }));
    await user.type(screen.getByLabelText("Contraseña actual", { exact: false, selector: "input" }), "Administrative-Password-99!");
    await user.type(screen.getByLabelText("Código de verificación", { exact: false }), "123456");
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    expect(await screen.findByText("1111-2222-3333")).toBeInTheDocument();
    const stepUpIndex = fetchMock.mock.calls.findIndex(([input]) => String(input).endsWith("/auth/step-up"));
    const actionIndexes = fetchMock.mock.calls.flatMap(([input], index) => String(input).includes("recovery-codes/regenerate") ? [index] : []);
    expect(stepUpIndex).toBeGreaterThanOrEqual(0);
    expect(actionIndexes).toHaveLength(2);
    expect(actionIndexes[1]).toBeGreaterThan(stepUpIndex);
    const stepUpRequest = fetchMock.mock.calls[stepUpIndex];
    expect(JSON.parse(String(stepUpRequest?.[1]?.body))).toEqual({ password: "Administrative-Password-99!", code: "123456" });
    const actionRequest = fetchMock.mock.calls[actionIndexes[1]!];
    expect(actionRequest?.[1]?.body).toBeUndefined();
  });

  it("renders stable backend MFA errors without exposing the raw response message", async () => {
    let revokeAttempts = 0;
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/auth/mfa/status")) {
        return response({ required: false, enrolled: true, status: "ACTIVE", confirmedAt: new Date().toISOString(), recoveryCodesRemaining: 8 });
      }
      if (url.endsWith("/auth/step-up")) {
        return response({ verifiedAt: new Date().toISOString() });
      }
      if (url.includes("/auth/mfa/revoke")) {
        revokeAttempts += 1;
        if (revokeAttempts === 1) {
          return response({ statusCode: 403, error: "Forbidden", code: "STEP_UP_REQUIRED", message: "Se requiere autenticación reciente para realizar esta acción." }, 403);
        }
        return response({ statusCode: 409, error: "Conflict", code: "MFA_CONFLICT", message: "raw backend detail" }, 409);
      }
      return response({}, 404);
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderPanel();

    await user.click(await screen.findByRole("button", { name: "Desactivar MFA" }));
    await user.type(screen.getByLabelText("Contraseña actual", { exact: false, selector: "input" }), "Administrative-Password-99!");
    await user.type(screen.getByLabelText("Código de verificación", { exact: false }), "123456");
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("La configuración MFA cambió o no permite esta operación.");
    expect(screen.getByRole("alert")).not.toHaveTextContent("raw backend detail");
    await waitFor(() => expect(fetchMock.mock.calls.some(([input]) => String(input).includes("/auth/mfa/revoke"))).toBe(true));
  });

  it("does not invoke the protected action when step-up verification fails", async () => {
    let regenerateAttempts = 0;
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/auth/mfa/status")) {
        return response({ required: true, enrolled: true, status: "ACTIVE", confirmedAt: new Date().toISOString(), recoveryCodesRemaining: 8 });
      }
      if (url.endsWith("/auth/step-up")) {
        return response({ statusCode: 401, error: "Unauthorized", code: "MFA_PASSWORD_INVALID", message: "raw password detail" }, 401);
      }
      if (url.includes("/auth/mfa/recovery-codes/regenerate")) {
        regenerateAttempts += 1;
        return response({ statusCode: 403, error: "Forbidden", code: "STEP_UP_REQUIRED", message: "Se requiere autenticación reciente para realizar esta acción." }, 403);
      }
      return response({}, 404);
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderPanel();

    await user.click(await screen.findByRole("button", { name: "Regenerar códigos" }));
    await user.type(screen.getByLabelText("Contraseña actual", { exact: false, selector: "input" }), "Administrative-Password-99!");
    await user.type(screen.getByLabelText("Código de verificación", { exact: false }), "123456");
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("No pudimos verificar la contraseña y el código.");
    expect(screen.getByRole("alert")).not.toHaveTextContent("raw password detail");
    expect(regenerateAttempts).toBe(1);
  });
});
