import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError } from "../api-error";
import { isContractValidationError, koralWebChatClient, type KoralWebChatClient } from "./koral-web-chat-api";
import { nextWebChatPollDelay } from "./polling";
import type { LocalWebChatMessage, WebChatSnapshot } from "./types";

type LoadState = "IDLE" | "BOOTSTRAPPING" | "READY" | "ERROR";

export interface WebChatVisibleError {
  kind: "OFFLINE" | "RATE_LIMITED" | "NETWORK" | "CONTRACT" | "UNAVAILABLE";
  message: string;
  retryAfterSeconds?: number;
}

export interface UseKoralWebChatResult {
  loadState: LoadState;
  snapshot: WebChatSnapshot | null;
  localMessages: LocalWebChatMessage[];
  error: WebChatVisibleError | null;
  offline: boolean;
  bootstrap(): Promise<void>;
  refresh(): Promise<void>;
  loadOlder(): Promise<void>;
  send(body: string): Promise<void>;
  retry(clientMessageId: string): Promise<void>;
}

export function useKoralWebChat(
  open: boolean,
  client: KoralWebChatClient = koralWebChatClient,
): UseKoralWebChatResult {
  const [loadState, setLoadState] = useState<LoadState>("IDLE");
  const [snapshot, setSnapshot] = useState<WebChatSnapshot | null>(null);
  const [localMessages, setLocalMessages] = useState<LocalWebChatMessage[]>([]);
  const [error, setError] = useState<WebChatVisibleError | null>(null);
  const [offline, setOffline] = useState(() => typeof navigator !== "undefined" && !navigator.onLine);
  const controllers = useRef(new Set<AbortController>());
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;

  const runRequest = useCallback(async <T,>(operation: (signal: AbortSignal) => Promise<T>): Promise<T> => {
    const controller = new AbortController();
    controllers.current.add(controller);
    try {
      return await operation(controller.signal);
    } finally {
      controllers.current.delete(controller);
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!open || !snapshotRef.current) return;
    try {
      const result = await runRequest((signal) => client.history(signal));
      setSnapshot(mergeSnapshots(snapshotRef.current, result));
      setError(null);
    } catch (caught) {
      if (isAbort(caught)) return;
      setError(toVisibleError(caught));
    }
  }, [client, open, runRequest]);

  const loadOlder = useCallback(async () => {
    const cursor = snapshotRef.current?.nextCursor;
    if (!open || offline || !cursor) return;
    try {
      const result = await runRequest((signal) => client.history(signal, cursor));
      setSnapshot(mergeSnapshots(snapshotRef.current, result));
      setError(null);
    } catch (caught) {
      if (isAbort(caught)) return;
      setError(toVisibleError(caught));
    }
  }, [client, offline, open, runRequest]);

  const bootstrap = useCallback(async () => {
    if (!open || offline) {
      if (offline) setError(offlineError());
      return;
    }
    setLoadState("BOOTSTRAPPING");
    setError(null);
    try {
      const initial = await runRequest((signal) => client.bootstrap(signal));
      setSnapshot(initial);
      setLoadState("READY");
      try {
        const history = await runRequest((signal) => client.history(signal));
        setSnapshot(mergeSnapshots(initial, history));
      } catch (caught) {
        if (!isAbort(caught)) setError(toVisibleError(caught));
      }
    } catch (caught) {
      if (isAbort(caught)) return;
      setError(toVisibleError(caught));
      setLoadState("ERROR");
    }
  }, [client, offline, open, runRequest]);

  const sendExisting = useCallback(async (message: LocalWebChatMessage) => {
    if (offline) {
      setLocalMessages((current) => current.map((item) => item.clientMessageId === message.clientMessageId
        ? { ...item, state: "RETRYABLE" }
        : item));
      setError(offlineError());
      return;
    }
    setLocalMessages((current) => current.map((item) => item.clientMessageId === message.clientMessageId
      ? { ...item, state: "PENDING" }
      : item));
    setError(null);
    try {
      const next = await runRequest((signal) => client.sendMessage({
        clientMessageId: message.clientMessageId,
        body: message.body,
      }, signal));
      setSnapshot(mergeSnapshots(snapshotRef.current, next));
      setLocalMessages((current) => current.filter((item) => item.clientMessageId !== message.clientMessageId));
    } catch (caught) {
      setLocalMessages((current) => current.map((item) => item.clientMessageId === message.clientMessageId
        ? { ...item, state: "RETRYABLE" }
        : item));
      setError(isAbort(caught)
        ? { kind: "NETWORK", message: "No pudimos confirmar el envío. Reintenta con la misma solicitud cuando estés listo." }
        : toVisibleError(caught));
    }
  }, [client, offline, runRequest]);

  const send = useCallback(async (body: string) => {
    const normalized = body.trim();
    if (!normalized || normalized.length > 4_000) return;
    const message: LocalWebChatMessage = {
      clientMessageId: crypto.randomUUID(),
      body: normalized,
      state: "PENDING",
    };
    setLocalMessages((current) => [...current, message]);
    await sendExisting(message);
  }, [sendExisting]);

  const retry = useCallback(async (clientMessageId: string) => {
    const message = localMessages.find((item) => item.clientMessageId === clientMessageId);
    if (message) await sendExisting(message);
  }, [localMessages, sendExisting]);

  useEffect(() => {
    if (!open || loadState !== "IDLE") return;
    void bootstrap();
  }, [bootstrap, loadState, open]);

  useEffect(() => {
    if (open) return;
    for (const controller of controllers.current) controller.abort();
    controllers.current.clear();
    if (!snapshotRef.current) setLoadState("IDLE");
  }, [open]);

  useEffect(() => {
    if (!snapshot) return;
    const persistedClientIds = new Set(snapshot.messages.flatMap((message) => message.clientMessageId ? [message.clientMessageId] : []));
    if (persistedClientIds.size > 0) {
      setLocalMessages((current) => current.filter((message) => !persistedClientIds.has(message.clientMessageId)));
    }
  }, [snapshot]);

  useEffect(() => {
    if (!open || loadState !== "READY" || offline || !snapshot) return;
    const delay = nextWebChatPollDelay(snapshot.conversation.status, snapshot.pollAfterMs);
    if (delay === null) return;
    const timeout = window.setTimeout(() => void refresh(), delay);
    return () => window.clearTimeout(timeout);
  }, [loadState, offline, open, refresh, snapshot]);

  useEffect(() => {
    const onOffline = () => {
      setOffline(true);
      setError(offlineError());
    };
    const onOnline = () => {
      setOffline(false);
      setError(null);
      if (open && snapshotRef.current) void refresh();
    };
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, [open, refresh]);

  useEffect(() => () => {
    for (const controller of controllers.current) controller.abort();
    controllers.current.clear();
  }, []);

  return useMemo(() => ({
    loadState,
    snapshot,
    localMessages,
    error,
    offline,
    bootstrap,
    refresh,
    loadOlder,
    send,
    retry,
  }), [bootstrap, error, loadOlder, loadState, localMessages, offline, refresh, retry, send, snapshot]);
}

function toVisibleError(error: unknown): WebChatVisibleError {
  if (isContractValidationError(error)) {
    return { kind: "CONTRACT", message: "El chat recibió una respuesta no compatible y se detuvo de forma segura." };
  }
  if (error instanceof ApiError) {
    if (error.kind === "rate_limited") {
      return {
        kind: "RATE_LIMITED",
        message: "Has enviado demasiados mensajes. Espera antes de intentar nuevamente.",
        retryAfterSeconds: error.retryAfterSeconds,
      };
    }
    if (error.kind === "network") return { kind: "NETWORK", message: error.message };
  }
  return { kind: "UNAVAILABLE", message: "El chat no está disponible en este momento. Intenta nuevamente más tarde." };
}

function offlineError(): WebChatVisibleError {
  return { kind: "OFFLINE", message: "Sin conexión. Tu mensaje no se reenviará automáticamente." };
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function mergeSnapshots(current: WebChatSnapshot | null, incoming: WebChatSnapshot): WebChatSnapshot {
  if (!current) return incoming;
  if (current.conversation.id !== incoming.conversation.id) {
    throw new Error("WEB_CHAT_CONVERSATION_CHANGED");
  }
  const messages = new Map(current.messages.map((message) => [message.id, message]));
  for (const message of incoming.messages) messages.set(message.id, message);
  return {
    ...incoming,
    messages: [...messages.values()].sort((left, right) => left.occurredAt.localeCompare(right.occurredAt)),
  };
}
