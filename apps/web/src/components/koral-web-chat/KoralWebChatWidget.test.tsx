import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApiError } from "../../lib/api-error";
import type { KoralWebChatClient } from "../../lib/koral-web-chat/koral-web-chat-api";
import { WEB_CHAT_CONTRACT_VERSION, type WebChatSnapshot } from "../../lib/koral-web-chat/types";
import { KoralWebChatWidget } from "./KoralWebChatWidget";

function snapshot(overrides: Partial<WebChatSnapshot["conversation"]> = {}): WebChatSnapshot {
  return {
    version: WEB_CHAT_CONTRACT_VERSION,
    conversation: {
      status: "AI_ACTIVE",
      aiAutoReplyAllowed: true,
      assuranceLevel: "ANONYMOUS",
      updatedAt: "2026-08-23T12:00:00.000Z",
      ...overrides,
    },
    messages: [],
  };
}

function client(initial = snapshot()): KoralWebChatClient {
  return {
    bootstrap: vi.fn().mockResolvedValue(initial),
    history: vi.fn().mockResolvedValue(initial),
    sendMessage: vi.fn().mockResolvedValue(initial),
    claimIdentity: vi.fn().mockResolvedValue(initial),
  };
}

describe("KoralWebChatWidget", () => {
  beforeEach(() => {
    Object.defineProperty(window.navigator, "onLine", { configurable: true, value: true });
  });

  it("bootstraps and resumes only after opening, then renders a real empty state", async () => {
    const api = client();
    render(<KoralWebChatWidget client={api} />);
    expect(api.bootstrap).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Abrir chat con Koral" }));
    expect(await screen.findByText("¿En qué podemos ayudarte?")).toBeVisible();
    expect(api.bootstrap).toHaveBeenCalledOnce();
    expect(api.history).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Cerrar chat" })).toHaveFocus();
  });

  it("keeps clientMessageId stable across explicit retry and never retries automatically", async () => {
    const api = client();
    vi.mocked(api.sendMessage)
      .mockRejectedValueOnce(new ApiError({ kind: "network", status: null, envelope: null }))
      .mockResolvedValueOnce(snapshot());
    render(<KoralWebChatWidget client={api} />);
    await userEvent.click(screen.getByRole("button", { name: "Abrir chat con Koral" }));
    await screen.findByText("¿En qué podemos ayudarte?");

    await userEvent.type(screen.getByLabelText("Escribe tu mensaje"), "Necesito orientación");
    await userEvent.click(screen.getByRole("button", { name: "Enviar mensaje" }));
    expect(await screen.findByText("No se pudo enviar")).toBeVisible();
    expect(api.sendMessage).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    await waitFor(() => expect(api.sendMessage).toHaveBeenCalledTimes(2));
    expect(vi.mocked(api.sendMessage).mock.calls[1]?.[0].clientMessageId)
      .toBe(vi.mocked(api.sendMessage).mock.calls[0]?.[0].clientMessageId);
  });

  it("projects human ownership without claiming that Koral is responding", async () => {
    const api = client(snapshot({ status: "HUMAN_ACTIVE", aiAutoReplyAllowed: false }));
    render(<KoralWebChatWidget client={api} />);
    await userEvent.click(screen.getByRole("button", { name: "Abrir chat con Koral" }));
    expect(await screen.findByText("Un asesor atiende esta conversación")).toBeVisible();
    expect(screen.queryByText(/Koral está escribiendo/iu)).not.toBeInTheDocument();
    expect(screen.queryByText(/stream/iu)).not.toBeInTheDocument();
  });

  it("keeps the mutation cooldown after a successful reconnect refresh", async () => {
    const api = client();
    vi.mocked(api.sendMessage).mockRejectedValueOnce(new ApiError({
      kind: "rate_limited",
      status: 429,
      envelope: null,
      retryAfterSeconds: 12,
    }));
    render(<KoralWebChatWidget client={api} />);
    await userEvent.click(screen.getByRole("button", { name: "Abrir chat con Koral" }));
    await screen.findByText("¿En qué podemos ayudarte?");
    await userEvent.type(screen.getByLabelText("Escribe tu mensaje"), "Hola");
    await userEvent.click(screen.getByRole("button", { name: "Enviar mensaje" }));
    expect(await screen.findByText(/demasiadas solicitudes/iu)).toBeVisible();
    expect(screen.getByText(/Puedes reintentar en \d+ s/iu)).toBeVisible();

    Object.defineProperty(window.navigator, "onLine", { configurable: true, value: false });
    fireEvent(window, new Event("offline"));
    expect(await screen.findByText("Sin conexión", { exact: true })).toBeVisible();
    expect(screen.getByText(/no se reenviará automáticamente/iu)).toBeVisible();
    Object.defineProperty(window.navigator, "onLine", { configurable: true, value: true });
    fireEvent(window, new Event("online"));
    await waitFor(() => expect(api.history).toHaveBeenCalledOnce());
    expect(screen.getByRole("button", { name: "Enviar mensaje" })).toBeDisabled();
    expect(screen.getByText(/Puedes reintentar en/iu)).toBeVisible();
  });

  it("claims only a display name and reuses clientClaimId on an explicit retry", async () => {
    const api = client();
    vi.mocked(api.claimIdentity)
      .mockRejectedValueOnce(new ApiError({ kind: "network", status: null, envelope: null }))
      .mockResolvedValueOnce(snapshot({ assuranceLevel: "CLAIMED" }));
    render(<KoralWebChatWidget client={api} />);
    await userEvent.click(screen.getByRole("button", { name: "Abrir chat con Koral" }));
    await screen.findByText("¿En qué podemos ayudarte?");
    await userEvent.click(screen.getByRole("button", { name: "Declarar mi nombre" }));
    expect(screen.getByText(/No verifica tu identidad ni inicia sesión/iu)).toBeVisible();
    await userEvent.type(screen.getByLabelText("¿Cómo quieres que te llamemos?"), "Visitante ASODEF");
    await userEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(await screen.findByRole("button", { name: "Reintentar" })).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    await waitFor(() => expect(api.claimIdentity).toHaveBeenCalledTimes(2));
    expect(vi.mocked(api.claimIdentity).mock.calls[1]?.[0].clientClaimId)
      .toBe(vi.mocked(api.claimIdentity).mock.calls[0]?.[0].clientClaimId);
    expect(await screen.findByText("Nombre declarado")).toBeVisible();
  });

  it("requires an explicit action before replacing an expired cookie session", async () => {
    const api = client();
    vi.mocked(api.bootstrap)
      .mockRejectedValueOnce(new ApiError({ kind: "unauthorized", status: 401, envelope: null }))
      .mockResolvedValueOnce(snapshot());
    render(<KoralWebChatWidget client={api} />);
    await userEvent.click(screen.getByRole("button", { name: "Abrir chat con Koral" }));
    const restart = await screen.findByRole("button", { name: "Iniciar una nueva conversación" });
    expect(api.bootstrap).toHaveBeenCalledOnce();
    await userEvent.click(restart);
    expect(await screen.findByText("¿En qué podemos ayudarte?")).toBeVisible();
    expect(api.bootstrap).toHaveBeenCalledTimes(2);
  });

  it("serializes older-history requests for the same opaque cursor", async () => {
    const initial = { ...snapshot(), nextCursor: "opaque-cursor-value" };
    const api = client(initial);
    let resolveHistory!: (value: WebChatSnapshot) => void;
    vi.mocked(api.history).mockReturnValueOnce(new Promise((resolve) => { resolveHistory = resolve; }));
    render(<KoralWebChatWidget client={api} />);
    await userEvent.click(screen.getByRole("button", { name: "Abrir chat con Koral" }));
    const older = await screen.findByRole("button", { name: "Cargar mensajes anteriores" });
    await userEvent.click(older);
    expect(await screen.findByRole("button", { name: "Cargando mensajes…" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Cargando mensajes…" }));
    expect(api.history).toHaveBeenCalledOnce();
    resolveHistory(snapshot());
    await waitFor(() => expect(screen.queryByText("Cargando mensajes…")).not.toBeInTheDocument());
  });

  it("closes on Escape, restores launcher focus, and disables the composer when closed", async () => {
    const api = client(snapshot({ status: "CLOSED", aiAutoReplyAllowed: false }));
    render(<KoralWebChatWidget client={api} />);
    const launcher = screen.getByRole("button", { name: "Abrir chat con Koral" });
    await userEvent.click(launcher);
    const composer = await screen.findByLabelText("Escribe tu mensaje");
    expect(composer).toBeDisabled();
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Abrir chat con Koral" })).toHaveFocus();
  });
});
