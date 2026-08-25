import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Bot, MessageCircle, RotateCcw, Send, ShieldCheck, UserRound, WifiOff, X } from "lucide-react";
import type { KoralWebChatClient } from "../../lib/koral-web-chat/koral-web-chat-api";
import { useKoralWebChat } from "../../lib/koral-web-chat/use-koral-web-chat";
import type { WebChatConversationStatus, WebChatMessage } from "../../lib/koral-web-chat/types";

const STATUS_COPY: Readonly<Record<WebChatConversationStatus, string>> = {
  AI_ACTIVE: "Koral disponible",
  WAITING_USER: "Koral espera tu respuesta",
  HUMAN_REQUIRED: "Se requiere atención de un asesor",
  HUMAN_ACTIVE: "Un asesor atiende esta conversación",
  WAITING_INTERNAL: "Procesando tu solicitud",
  RESOLVED: "Conversación resuelta",
  CLOSED: "Conversación cerrada",
};

export interface KoralWebChatWidgetProps {
  client?: KoralWebChatClient;
}

export function KoralWebChatWidget({ client }: KoralWebChatWidgetProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [claimOpen, setClaimOpen] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const launcherRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const chat = useKoralWebChat(open, client);
  const rateLimitSeconds = useCooldownCountdown(chat.mutationCooldownUntil);
  const closed = chat.snapshot?.conversation.status === "CLOSED";
  const sessionExpired = chat.error?.kind === "SESSION_EXPIRED";
  const assuranceLevel = chat.snapshot?.conversation.assuranceLevel;
  const messages = useMemo(() => chat.snapshot?.messages ?? [], [chat.snapshot?.messages]);

  const close = useCallback(() => {
    setOpen(false);
    window.setTimeout(() => launcherRef.current?.focus(), 0);
  }, []);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [close, open]);

  useEffect(() => {
    if (transcriptRef.current) transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
  }, [chat.localMessages, messages]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const body = draft.trim();
    if (!body || closed || sessionExpired || chat.loadState !== "READY" || rateLimitSeconds > 0) return;
    setDraft("");
    void chat.send(body);
  };

  return (
    <div className="fixed bottom-24 right-4 z-40 sm:right-6">
      {open && (
        <section
          id="koral-web-chat-panel"
          role="dialog"
          aria-modal="false"
          aria-labelledby="koral-web-chat-title"
          className="mb-3 flex h-[min(42rem,calc(100dvh-11rem))] w-[calc(100vw-2rem)] max-w-[24rem] flex-col overflow-hidden rounded-xl3 border border-brand-dark/15 bg-white shadow-e4"
        >
          <header className="flex items-center gap-3 bg-brand-deep px-4 py-3 text-white">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/12" aria-hidden="true">
              <Bot className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 id="koral-web-chat-title" className="font-display text-base font-semibold">Habla con Koral</h2>
              <p className="truncate text-xs text-white/75">Asistencia digital de ASODEF</p>
            </div>
            <button
              ref={closeRef}
              type="button"
              onClick={close}
              aria-label="Cerrar chat"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/10 hover:text-white"
            >
              <X aria-hidden="true" className="h-5 w-5" />
            </button>
          </header>

          <ConversationStatusBar
            status={chat.snapshot?.conversation.status}
            aiAutoReplyAllowed={chat.snapshot?.conversation.aiAutoReplyAllowed}
            offline={chat.offline}
          />

          {chat.snapshot?.conversation.status === "HUMAN_REQUIRED" && (
            <div
              className="border-b border-warning/20 bg-brand-orange-50 px-4 py-2 text-xs leading-5 text-brand-orange-900"
              role="status"
              aria-live="polite"
            >
              Koral no puede continuar automáticamente con esta solicitud. Se requiere atención humana.
            </div>
          )}

          <div
            ref={transcriptRef}
            className="min-h-0 flex-1 overflow-y-auto bg-bg-base px-4 py-4"
            aria-label="Historial de conversación"
            aria-busy={chat.loadState === "BOOTSTRAPPING" || chat.loadingOlder}
          >
            {chat.loadState === "BOOTSTRAPPING" && <LoadingTranscript />}
            {chat.loadState === "ERROR" && !chat.snapshot && (
              <LoadFailure
                actionLabel={sessionExpired ? "Iniciar una nueva conversación" : "Reintentar conexión"}
                message={chat.error?.message}
                onRetry={() => void (sessionExpired ? chat.restartSession() : chat.bootstrap())}
              />
            )}
            {chat.loadState === "READY" && messages.length === 0 && chat.localMessages.length === 0 && <EmptyTranscript />}
            {chat.snapshot?.nextCursor && (
              <div className="mb-4 text-center">
                <button
                  type="button"
                  onClick={() => void chat.loadOlder()}
                  disabled={chat.loadingOlder}
                  className="min-h-10 rounded-full border border-brand-dark/15 px-3 text-xs font-semibold text-brand-dark disabled:cursor-wait disabled:opacity-60"
                >
                  {chat.loadingOlder ? "Cargando mensajes…" : "Cargar mensajes anteriores"}
                </button>
              </div>
            )}
            <ol className="space-y-3" role="log" aria-live="polite" aria-relevant="additions">
              {messages.map((message) => <ServerMessage key={message.id} message={message} />)}
              {chat.localMessages.map((message) => (
                <li key={message.clientMessageId} className="ml-auto max-w-[85%]">
                  <div className="rounded-2xl rounded-br-md bg-brand-dark px-3.5 py-2.5 text-sm leading-5 text-white">
                    {message.body}
                  </div>
                  <div className="mt-1 flex items-center justify-end gap-2 text-xs text-text-muted">
                    <span>{message.state === "PENDING" ? "Enviando…" : "No se pudo enviar"}</span>
                    {message.state === "RETRYABLE" && (
                      <button
                        type="button"
                        onClick={() => void chat.retry(message.clientMessageId)}
                        disabled={rateLimitSeconds > 0}
                        className="inline-flex min-h-8 items-center gap-1 font-semibold text-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />
                        Reintentar
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </div>

          {(chat.error || rateLimitSeconds > 0) && (
            <div role="status" aria-live="polite" className="border-t border-warning/20 bg-brand-orange-50 px-4 py-2 text-xs text-brand-orange-900">
              <span className="inline-flex items-start gap-2">
                {chat.error?.kind === "OFFLINE" && <WifiOff aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
                <span>
                  {chat.error?.message ?? "Espera antes de realizar otra operación."}
                  {rateLimitSeconds > 0 && ` Puedes reintentar en ${rateLimitSeconds} s.`}
                </span>
              </span>
              {sessionExpired && chat.snapshot && (
                <button
                  type="button"
                  onClick={() => void chat.restartSession()}
                  className="mt-2 min-h-9 rounded-full border border-brand-orange-900/20 px-3 font-semibold"
                >
                  Iniciar una nueva conversación
                </button>
              )}
            </div>
          )}

          <form onSubmit={submit} className="border-t border-border-soft bg-white p-3">
            <label htmlFor="koral-web-chat-message" className="sr-only">Escribe tu mensaje</label>
            <div className="flex items-end gap-2">
              <textarea
                id="koral-web-chat-message"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
                rows={2}
                maxLength={4_000}
                disabled={closed || sessionExpired || chat.loadState !== "READY"}
                placeholder={closed ? "Esta conversación está cerrada" : sessionExpired ? "La sesión del chat finalizó" : "Escribe tu mensaje"}
                className="min-h-12 max-h-28 flex-1 resize-none rounded-2xl border border-brand-dark/15 bg-bg-base px-3 py-2 text-sm text-text-main outline-none transition focus:border-brand-dark focus:ring-2 focus:ring-brand-dark/15 disabled:cursor-not-allowed disabled:opacity-60"
              />
              <button
                type="submit"
                aria-label="Enviar mensaje"
                disabled={!draft.trim() || closed || sessionExpired || chat.loadState !== "READY" || rateLimitSeconds > 0}
                className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-orange text-white shadow-e1 transition hover:bg-brand-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Send aria-hidden="true" className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-2 flex items-start justify-between gap-3 text-[11px] leading-4 text-text-muted">
              <span className="inline-flex items-center gap-1"><ShieldCheck aria-hidden="true" className="h-3.5 w-3.5" />Sesión protegida por ASODEF</span>
              {assuranceLevel === "ANONYMOUS" ? (
                <button
                  type="button"
                  onClick={() => setClaimOpen((current) => !current)}
                  disabled={sessionExpired || chat.loadState !== "READY" || rateLimitSeconds > 0}
                  aria-expanded={claimOpen}
                  aria-controls="koral-web-chat-claim"
                  className="min-h-8 text-right font-semibold text-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Declarar mi nombre
                </button>
              ) : (
                <span className="text-right">{assuranceLevel === "CLAIMED" ? "Nombre declarado" : "Identidad verificada por ASODEF"}</span>
              )}
            </div>
          </form>

          {claimOpen && assuranceLevel === "ANONYMOUS" && (
            <form
              id="koral-web-chat-claim"
              onSubmit={(event) => {
                event.preventDefault();
                void chat.claim(displayName);
              }}
              className="border-t border-border-soft bg-bg-base p-3"
            >
              <label htmlFor="koral-web-chat-display-name" className="text-xs font-semibold text-text-main">¿Cómo quieres que te llamemos?</label>
              <p className="mt-1 text-[11px] leading-4 text-text-muted">Este nombre es declarado por ti. No verifica tu identidad ni inicia sesión.</p>
              <div className="mt-2 flex gap-2">
                <input
                  id="koral-web-chat-display-name"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  maxLength={120}
                  autoComplete="name"
                  disabled={chat.claimState === "PENDING" || rateLimitSeconds > 0}
                  className="min-h-10 min-w-0 flex-1 rounded-full border border-brand-dark/15 bg-white px-3 text-sm outline-none focus:border-brand-dark focus:ring-2 focus:ring-brand-dark/15"
                />
                <button
                  type="submit"
                  disabled={!displayName.trim() || chat.claimState === "PENDING" || rateLimitSeconds > 0}
                  className="min-h-10 rounded-full bg-brand-dark px-3 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {chat.claimState === "PENDING" ? "Guardando…" : chat.claimState === "RETRYABLE" ? "Reintentar" : "Continuar"}
                </button>
              </div>
            </form>
          )}
        </section>
      )}

      <button
        ref={launcherRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-controls={open ? "koral-web-chat-panel" : undefined}
        aria-label={open ? "Cerrar chat con Koral" : "Abrir chat con Koral"}
        className="ml-auto inline-flex h-14 w-14 items-center justify-center rounded-full bg-brand-orange text-white shadow-e3 transition-transform hover:-translate-y-0.5 hover:bg-brand-orange-600 motion-reduce:transform-none"
      >
        {open ? <X aria-hidden="true" className="h-6 w-6" /> : <MessageCircle aria-hidden="true" className="h-6 w-6" />}
      </button>
    </div>
  );
}

function ConversationStatusBar({
  status,
  aiAutoReplyAllowed,
  offline,
}: {
  status?: WebChatConversationStatus;
  aiAutoReplyAllowed?: boolean;
  offline: boolean;
}) {
  const label = offline
    ? "Sin conexión"
    : status
      ? status === "AI_ACTIVE" && aiAutoReplyAllowed === false
        ? "Atención automatizada pausada"
        : STATUS_COPY[status]
      : "Conectando de forma segura";
  return (
    <div className="flex min-h-9 items-center gap-2 border-b border-border-soft bg-white px-4 text-xs text-text-muted" role="status" aria-live="polite">
      <span aria-hidden="true" className={`h-2 w-2 rounded-full ${offline ? "bg-danger" : "bg-success"}`} />
      {label}
    </div>
  );
}

function ServerMessage({ message }: { message: WebChatMessage }) {
  const visitor = message.author === "VISITOR";
  const label = message.author === "HUMAN" ? "Asesor" : message.author === "KORAL" ? "Koral" : message.author === "SYSTEM" ? "ASODEF" : "Tú";
  return (
    <li className={visitor ? "ml-auto max-w-[85%]" : "mr-auto max-w-[85%]"}>
      <div className={`flex items-center gap-1.5 text-[11px] font-semibold ${visitor ? "justify-end text-brand-dark" : "text-text-muted"}`}>
        {!visitor && (message.author === "HUMAN" ? <UserRound aria-hidden="true" className="h-3.5 w-3.5" /> : <Bot aria-hidden="true" className="h-3.5 w-3.5" />)}
        {label}
      </div>
      <div className={`mt-1 rounded-2xl px-3.5 py-2.5 text-sm leading-5 ${visitor ? "rounded-br-md bg-brand-dark text-white" : "rounded-bl-md border border-border-soft bg-white text-text-main shadow-e1"}`}>
        {message.content.body}
      </div>
      <time dateTime={message.occurredAt} className={`mt-1 block text-[10px] text-text-muted ${visitor ? "text-right" : "text-left"}`}>
        {formatMessageTime(message.occurredAt)}
      </time>
    </li>
  );
}

function LoadingTranscript() {
  return <div role="status" className="py-12 text-center text-sm text-text-muted">Conectando con ASODEF…</div>;
}

function EmptyTranscript() {
  return (
    <div className="mx-auto max-w-xs py-10 text-center">
      <Bot aria-hidden="true" className="mx-auto h-8 w-8 text-brand-dark" />
      <p className="mt-3 font-semibold text-text-main">¿En qué podemos ayudarte?</p>
      <p className="mt-1 text-sm leading-5 text-text-muted">Escribe tu consulta. Si se requiere atención humana, te lo indicaremos claramente.</p>
    </div>
  );
}

function LoadFailure({ actionLabel, message, onRetry }: { actionLabel: string; message?: string; onRetry(): void }) {
  return (
    <div role="alert" className="mx-auto max-w-xs py-10 text-center">
      <p className="text-sm leading-5 text-text-muted">{message ?? "El chat no está disponible en este momento."}</p>
      <button type="button" onClick={onRetry} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full border border-brand-dark/20 px-4 text-sm font-semibold text-brand-dark">
        <RotateCcw aria-hidden="true" className="h-4 w-4" />{actionLabel}
      </button>
    </div>
  );
}

function useCooldownCountdown(until: number | null): number {
  const [seconds, setSeconds] = useState(() => cooldownSeconds(until));
  useEffect(() => {
    setSeconds(cooldownSeconds(until));
    if (until === null || until <= Date.now()) return;
    const interval = window.setInterval(() => setSeconds(cooldownSeconds(until)), 250);
    return () => window.clearInterval(interval);
  }, [until]);
  return seconds;
}

function cooldownSeconds(until: number | null): number {
  return until === null ? 0 : Math.max(0, Math.ceil((until - Date.now()) / 1_000));
}

function formatMessageTime(value: string): string {
  return new Intl.DateTimeFormat("es-CO", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}
