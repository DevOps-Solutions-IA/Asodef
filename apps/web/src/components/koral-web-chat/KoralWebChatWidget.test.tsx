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
      id: "28dce9a7-2822-4ac1-9eb2-b52f714699f3",
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
    expect(api.history).toHaveBeenCalledOnce();
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

  it("shows rate-limit guidance, an offline state, and keeps identity claims disabled", async () => {
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
    expect(await screen.findByText(/demasiados mensajes/iu)).toBeVisible();
    expect(screen.getByText(/12 s/u)).toBeVisible();
    expect(screen.getByRole("button", { name: /Identificarme/u })).toBeDisabled();

    Object.defineProperty(window.navigator, "onLine", { configurable: true, value: false });
    fireEvent(window, new Event("offline"));
    expect(await screen.findByText("Sin conexión", { exact: true })).toBeVisible();
    expect(screen.getByText(/no se reenviará automáticamente/iu)).toBeVisible();
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
