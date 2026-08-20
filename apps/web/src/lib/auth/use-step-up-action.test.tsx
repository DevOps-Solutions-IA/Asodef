import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api-error";
import { isStepUpCancelledError, useStepUpAction } from "./use-step-up-action";

function stepUpRequired(): ApiError {
  return new ApiError({
    kind: "forbidden",
    status: 403,
    envelope: { statusCode: 403, error: "Forbidden", message: "Step-up required", code: "STEP_UP_REQUIRED" },
  });
}

function Harness({ action }: { action: () => Promise<string> }) {
  const stepUp = useStepUpAction();
  const [result, setResult] = useState("idle");
  return <>
    <button onClick={() => void stepUp.execute(action).then(setResult).catch((error) => setResult(isStepUpCancelledError(error) ? "cancelled" : "failed"))}>Ejecutar</button>
    <output>{result}</output>
    {stepUp.dialog}
  </>;
}

function response(status: number, body: unknown): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}

describe("useStepUpAction", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("cancels without retrying the protected action and clears credentials", async () => {
    const action = vi.fn().mockRejectedValueOnce(stepUpRequired());
    render(<Harness action={action} />);
    await userEvent.click(screen.getByRole("button", { name: "Ejecutar" }));
    await userEvent.type(screen.getByLabelText(/Contraseña actual/), "ValidPassword!23");
    await userEvent.type(screen.getByLabelText(/Código de verificación/), "123456");
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.getByText("cancelled")).toBeInTheDocument());
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("keeps the challenge open and does not invoke the action after a wrong factor", async () => {
    const action = vi.fn().mockRejectedValueOnce(stepUpRequired());
    const fetchMock = vi.fn(() => response(401, { statusCode: 401, error: "Unauthorized", message: "Invalid", code: "MFA_PASSWORD_INVALID" }));
    vi.stubGlobal("fetch", fetchMock);
    render(<Harness action={action} />);
    await userEvent.click(screen.getByRole("button", { name: "Ejecutar" }));
    await userEvent.type(screen.getByLabelText(/Contraseña actual/), "ValidPassword!23");
    await userEvent.type(screen.getByLabelText(/Código de verificación/), "123456");
    await userEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(await screen.findByText("La contraseña actual no es válida.")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(action).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    [429, { statusCode: 429, error: "Too Many Requests", message: "limited" }, "Demasiados intentos"],
    [503, { statusCode: 503, error: "Unavailable", message: "redis detail" }, "El servicio no está disponible"],
    [401, { statusCode: 401, error: "Unauthorized", message: "expired" }, "Debes iniciar sesión"],
  ])("presents the safe operational category for HTTP %s", async (status, body, expected) => {
    const action = vi.fn().mockRejectedValueOnce(stepUpRequired());
    vi.stubGlobal("fetch", vi.fn(() => response(status, body)));
    render(<Harness action={action} />);
    await userEvent.click(screen.getByRole("button", { name: "Ejecutar" }));
    await userEvent.type(screen.getByLabelText(/Contraseña actual/), "ValidPassword!23");
    await userEvent.type(screen.getByLabelText(/Código de verificación/), "123456");
    await userEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(await screen.findByText(new RegExp(expected))).toBeInTheDocument();
    expect(screen.queryByText(/redis detail|limited|expired/)).not.toBeInTheDocument();
  });

  it("verifies once and retries the exact action once without a loop", async () => {
    const action = vi.fn().mockRejectedValueOnce(stepUpRequired()).mockResolvedValueOnce("completed");
    const fetchMock = vi.fn((_input: RequestInfo | URL) => response(200, { verifiedAt: "2026-08-20T12:00:00.000Z" }));
    vi.stubGlobal("fetch", fetchMock);
    render(<Harness action={action} />);
    await userEvent.click(screen.getByRole("button", { name: "Ejecutar" }));
    await userEvent.type(screen.getByLabelText(/Contraseña actual/), "ValidPassword!23");
    await userEvent.type(screen.getByLabelText(/Código de verificación/), "123456");
    await userEvent.click(screen.getByRole("button", { name: "Continuar" }));
    await waitFor(() => expect(screen.getByText("completed")).toBeInTheDocument());
    expect(action).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/auth/step-up");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("does not reopen when the single retry still requires step-up", async () => {
    const action = vi.fn().mockRejectedValue(stepUpRequired());
    vi.stubGlobal("fetch", vi.fn(() => response(200, { verifiedAt: "2026-08-20T12:00:00.000Z" })));
    render(<Harness action={action} />);
    await userEvent.click(screen.getByRole("button", { name: "Ejecutar" }));
    await userEvent.type(screen.getByLabelText(/Contraseña actual/), "ValidPassword!23");
    await userEvent.type(screen.getByLabelText(/Código de verificación/), "123456");
    await userEvent.click(screen.getByRole("button", { name: "Continuar" }));
    await waitFor(() => expect(screen.getByText("failed")).toBeInTheDocument());
    expect(action).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
