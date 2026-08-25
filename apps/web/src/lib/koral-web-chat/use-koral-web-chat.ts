import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError } from "../api-error";
import { isContractValidationError, koralWebChatClient, type KoralWebChatClient } from "./koral-web-chat-api";
import { nextWebChatPollDelay } from "./polling";
import type { LocalWebChatMessage, WebChatSnapshot } from "./types";

type LoadState = "IDLE" | "BOOTSTRAPPING" | "READY" | "ERROR";
type ClaimState = "IDLE" | "PENDING" | "RETRYABLE";

export interface WebChatVisibleError {
  kind: "OFFLINE" | "SESSION_EXPIRED" | "RATE_LIMITED" | "NETWORK" | "CONTRACT" | "CONFLICT" | "UNAVAILABLE";
  message: string;
}

export interface UseKoralWebChatResult {
  loadState: LoadState;
  snapshot: WebChatSnapshot | null;
  localMessages: LocalWebChatMessage[];
  error: WebChatVisibleError | null;
  offline: boolean;
  loadingOlder: boolean;
  claimState: ClaimState;
  mutationCooldownUntil: number | null;
  bootstrap(): Promise<void>;
  restartSession(): Promise<void>;
  refresh(): Promise<void>;
  loadOlder(): Promise<void>;
  send(body: string): Promise<void>;
  retry(clientMessageId: string): Promise<void>;
  claim(displayName: string): Promise<void>;
}

interface PendingClaim {
  clientClaimId: string;
  displayName: string;
  state: Exclude<ClaimState, "IDLE">;
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
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [pendingClaim, setPendingClaim] = useState<PendingClaim | null>(null);
  const [mutationCooldownUntil, setMutationCooldownUntil] = useState<number | null>(null);
  const controllers = useRef(new Set<AbortController>());
  const loadingOlderRef = useRef(false);
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

  const applyRequestError = useCallback((caught: unknown): WebChatVisibleError | null => {
    if (isAbort(caught)) return null;
    const visible = toVisibleError(caught);
    if (visible.kind === "SESSION_EXPIRED") setLoadState("ERROR");
    setError(visible);
    return visible;
  }, []);

  const applyMutationError = useCallback((caught: unknown): WebChatVisibleError | null => {
    if (isAbort(caught)) return {
      kind: "NETWORK",
      message: "No pudimos confirmar la operación. Reintenta explícitamente cuando estés listo.",
    };
    if (caught instanceof ApiError && caught.kind === "rate_limited") {
      const retryAfterSeconds = Math.max(1, caught.retryAfterSeconds ?? 30);
      setMutationCooldownUntil(Date.now() + retryAfterSeconds * 1_000);
      const visible: WebChatVisibleError = {
        kind: "RATE_LIMITED",
        message: "Has realizado demasiadas solicitudes. Espera antes de intentar nuevamente.",
      };
      setError(visible);
      return visible;
    }
    return applyRequestError(caught);
  }, [applyRequestError]);

  const refresh = useCallback(async () => {
    if (!open || !snapshotRef.current) return;
    try {
      const result = await runRequest((signal) => client.history(signal));
      setSnapshot(mergeSnapshots(snapshotRef.current, result, "PRESERVE_CURSOR"));
      setError(null);
    } catch (caught) {
      applyRequestError(caught);
    }
  }, [applyRequestError, client, open, runRequest]);

  const loadOlder = useCallback(async () => {
    const cursor = snapshotRef.current?.nextCursor;
    if (!open || offline || !cursor || loadingOlderRef.current) return;
    loadingOlderRef.current = true;
    setLoadingOlder(true);
    try {
      const result = await runRequest((signal) => client.history(signal, cursor));
      setSnapshot(mergeSnapshots(snapshotRef.current, result, "ADVANCE_CURSOR"));
      setError(null);
    } catch (caught) {
      applyRequestError(caught);
    } finally {
      loadingOlderRef.current = false;
      setLoadingOlder(false);
    }
  }, [applyRequestError, client, offline, open, runRequest]);

  const bootstrap = useCallback(async () => {
    if (!open || offline) {
      if (offline) setError(offlineError());
      return;
    }
    setLoadState("BOOTSTRAPPING");
    setError(null);
    try {
      // Bootstrap rotates/resumes the cookie-bound session and already returns
      // its current history. A redundant history request would only increase
      // rate-limit and partial-failure surface.
      const initial = await runRequest((signal) => client.bootstrap(signal));
      setSnapshot(initial);
      setLoadState("READY");
    } catch (caught) {
      applyRequestError(caught);
      setLoadState("ERROR");
    }
  }, [applyRequestError, client, offline, open, runRequest]);

  const restartSession = useCallback(async () => {
    // The server clears an invalid capability on 401. Starting a replacement
    // conversation is deliberately user initiated; stale transcript and
    // mutation identifiers are never carried into the new session.
    setSnapshot(null);
    snapshotRef.current = null;
    setLocalMessages([]);
    setPendingClaim(null);
    setMutationCooldownUntil(null);
    setError(null);
    setLoadState("IDLE");
    if (!open || offline) {
      if (offline) setError(offlineError());
      return;
    }
    setLoadState("BOOTSTRAPPING");
    try {
      const initial = await runRequest((signal) => client.bootstrap(signal));
      setSnapshot(initial);
      setLoadState("READY");
    } catch (caught) {
      applyRequestError(caught);
      setLoadState("ERROR");
    }
  }, [applyRequestError, client, offline, open, runRequest]);

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
      setSnapshot(mergeSnapshots(snapshotRef.current, next, "PRESERVE_CURSOR"));
      setLocalMessages((current) => current.filter((item) => item.clientMessageId !== message.clientMessageId));
    } catch (caught) {
      setLocalMessages((current) => current.map((item) => item.clientMessageId === message.clientMessageId
        ? { ...item, state: "RETRYABLE" }
        : item));
      const visible = applyMutationError(caught);
      if (visible) setError(visible);
    }
  }, [applyMutationError, client, offline, runRequest]);

  const send = useCallback(async (body: string) => {
    const normalized = body.trim();
    if (!normalized || normalized.length > 4_000 || cooldownActive(mutationCooldownUntil)) return;
    const message: LocalWebChatMessage = {
      clientMessageId: crypto.randomUUID(),
      body: normalized,
      state: "PENDING",
    };
    setLocalMessages((current) => [...current, message]);
    await sendExisting(message);
  }, [mutationCooldownUntil, sendExisting]);

  const retry = useCallback(async (clientMessageId: string) => {
    if (cooldownActive(mutationCooldownUntil)) return;
    const message = localMessages.find((item) => item.clientMessageId === clientMessageId);
    if (message) await sendExisting(message);
  }, [localMessages, mutationCooldownUntil, sendExisting]);

  const claim = useCallback(async (displayName: string) => {
    const normalized = displayName.trim().replace(/\s+/gu, " ");
    if (!normalized || normalized.length > 120 || cooldownActive(mutationCooldownUntil)) return;
    const existing = pendingClaim?.state === "RETRYABLE" && pendingClaim.displayName === normalized
      ? pendingClaim
      : { clientClaimId: crypto.randomUUID(), displayName: normalized, state: "PENDING" as const };
    setPendingClaim({ ...existing, state: "PENDING" });
    setError(null);
    try {
      const next = await runRequest((signal) => client.claimIdentity({
        clientClaimId: existing.clientClaimId,
        displayName: existing.displayName,
      }, signal));
      setSnapshot(mergeSnapshots(snapshotRef.current, next, "PRESERVE_CURSOR"));
      setPendingClaim(null);
    } catch (caught) {
      setPendingClaim({ ...existing, state: "RETRYABLE" });
      const visible = applyMutationError(caught);
      if (visible) setError(visible);
    }
  }, [applyMutationError, client, mutationCooldownUntil, pendingClaim, runRequest]);

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
    if (mutationCooldownUntil === null) return;
    const delay = Math.max(0, mutationCooldownUntil - Date.now());
    const timeout = window.setTimeout(() => {
      setMutationCooldownUntil(null);
      setError((current) => current?.kind === "RATE_LIMITED" ? null : current);
    }, delay);
    return () => window.clearTimeout(timeout);
  }, [mutationCooldownUntil]);

  useEffect(() => {
    const onOffline = () => {
      setOffline(true);
      setError(offlineError());
    };
    const onOnline = () => {
      setOffline(false);
      setError((current) => current?.kind === "SESSION_EXPIRED" ? current : null);
      if (open && loadState === "READY" && snapshotRef.current) void refresh();
    };
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, [loadState, open, refresh]);

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
    loadingOlder,
    claimState: pendingClaim?.state ?? "IDLE",
    mutationCooldownUntil,
    bootstrap,
    restartSession,
    refresh,
    loadOlder,
    send,
    retry,
    claim,
  }), [
    bootstrap,
    claim,
    error,
    loadOlder,
    loadState,
    loadingOlder,
    localMessages,
    mutationCooldownUntil,
    offline,
    pendingClaim?.state,
    refresh,
    restartSession,
    retry,
    send,
    snapshot,
  ]);
}

function toVisibleError(error: unknown): WebChatVisibleError {
  if (isContractValidationError(error)) {
    return { kind: "CONTRACT", message: "El chat recibió una respuesta no compatible y se detuvo de forma segura." };
  }
  if (error instanceof ApiError) {
    if (error.kind === "unauthorized") {
      return { kind: "SESSION_EXPIRED", message: "La sesión del chat finalizó. Puedes iniciar una conversación nueva de forma explícita." };
    }
    if (error.kind === "network") return { kind: "NETWORK", message: error.message };
    if (error.status === 409) {
      return { kind: "CONFLICT", message: "La conversación cambió mientras realizabas la operación. Actualiza antes de reintentar." };
    }
  }
  return { kind: "UNAVAILABLE", message: "El chat no está disponible en este momento. Intenta nuevamente más tarde." };
}

function offlineError(): WebChatVisibleError {
  return { kind: "OFFLINE", message: "Sin conexión. Tu mensaje no se reenviará automáticamente." };
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function cooldownActive(until: number | null): boolean {
  return until !== null && until > Date.now();
}

function mergeSnapshots(
  current: WebChatSnapshot | null,
  incoming: WebChatSnapshot,
  cursorMode: "PRESERVE_CURSOR" | "ADVANCE_CURSOR",
): WebChatSnapshot {
  if (!current) return incoming;
  const messages = new Map(current.messages.map((message) => [message.id, message]));
  for (const message of incoming.messages) messages.set(message.id, message);
  const nextCursor = cursorMode === "ADVANCE_CURSOR"
    ? incoming.nextCursor
    : current.nextCursor ?? incoming.nextCursor;
  const merged = {
    ...incoming,
    messages: [...messages.values()].sort((left, right) => {
      const timeOrder = left.occurredAt.localeCompare(right.occurredAt);
      return timeOrder === 0 ? left.id.localeCompare(right.id) : timeOrder;
    }),
  };
  if (nextCursor) return { ...merged, nextCursor };
  const withoutCursor = { ...merged };
  delete withoutCursor.nextCursor;
  return withoutCursor;
}
