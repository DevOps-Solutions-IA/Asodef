import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Badge, Button, EmptyState, ErrorState, Input, PageHeader, Select, Skeleton, StatusBadge } from "@asodef/ui";
import { Clock3, Inbox, MessageSquareText, Search } from "lucide-react";
import { ApiError } from "../../lib/api-error";
import { getAdminErrorMessage } from "../../lib/admin/admin-error-messages";
import { useAuth } from "../../lib/auth/auth-context";
import { isStepUpCancelledError, useStepUpAction } from "../../lib/auth/use-step-up-action";
import {
  addConversationNote,
  assignConversation,
  changeConversationPriority,
  getInboxConversation,
  koralInboxKeys,
  listEligibleAssignees,
  listInboxConversations,
  markConversationRead,
  releaseConversation,
  returnConversationToKoral,
  transitionConversationStatus,
} from "./koral-inbox.api";
import type { ConversationPriority, ConversationQueueView, ConversationStatus, InboxConversationDetail, InboxFilters } from "./koral-inbox.types";

const STATUS_LABELS: Record<ConversationStatus, string> = {
  AI_ACTIVE: "Koral activo",
  WAITING_USER: "Esperando usuario",
  HUMAN_REQUIRED: "Requiere asesor",
  HUMAN_ACTIVE: "Atención humana",
  WAITING_INTERNAL: "Espera interna",
  RESOLVED: "Resuelta",
  CLOSED: "Cerrada",
};
const PRIORITIES: ConversationPriority[] = ["LOW", "NORMAL", "HIGH", "URGENT"];
const STATUSES = Object.keys(STATUS_LABELS) as ConversationStatus[];

export function KoralHumanInboxPage() {
  const { user, hasPermission } = useAuth();
  const canManage = hasPermission("koral.conversations.manage");
  const queryClient = useQueryClient();
  const stepUp = useStepUpAction();
  const [filters, setFilters] = useState<InboxFilters>({ queue: "ALL", page: 1, pageSize: 30 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [assigneeUserId, setAssigneeUserId] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");

  const listQuery = useQuery({
    queryKey: koralInboxKeys.list(filters),
    queryFn: ({ signal }) => listInboxConversations(filters, signal),
  });
  const detailQuery = useQuery({
    queryKey: koralInboxKeys.detail(selectedId ?? "none"),
    queryFn: ({ signal }) => getInboxConversation(selectedId!, signal),
    enabled: Boolean(selectedId),
  });
  const assigneesQuery = useQuery({
    queryKey: koralInboxKeys.assignees,
    queryFn: ({ signal }) => listEligibleAssignees(signal),
    enabled: canManage,
  });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: koralInboxKeys.all });
  };

  const command = useMutation({
    mutationFn: async (action: "assign" | "release" | "return" | "priority" | "resolve" | "close") => {
      const detail = detailQuery.data;
      if (!detail) throw new Error("Conversation detail unavailable");
      const input = { expectedVersion: detail.version, idempotencyKey: crypto.randomUUID(), reason: reason.trim() };
      return stepUp.execute(() => {
        if (action === "assign") return assignConversation(detail.id, { ...input, assigneeUserId, priority: detail.priority });
        if (action === "release") return releaseConversation(detail.id, input);
        if (action === "return") return returnConversationToKoral(detail.id, input);
        if (action === "priority") return changeConversationPriority(detail.id, { ...input, priority: detail.priority === "URGENT" ? "HIGH" : "URGENT" });
        if (action === "resolve") return transitionConversationStatus(detail.id, { ...input, targetStatus: "RESOLVED" });
        return transitionConversationStatus(detail.id, { ...input, targetStatus: "CLOSED" });
      });
    },
    onSuccess: async () => {
      setReason("");
      await refresh();
    },
  });

  const noteMutation = useMutation({
    mutationFn: () => addConversationNote(selectedId!, note.trim()),
    onSuccess: async () => {
      setNote("");
      await refresh();
    },
  });
  const readMutation = useMutation({ mutationFn: markConversationRead, onSuccess: refresh });

  useEffect(() => {
    if (selectedId && detailQuery.data?.unread && !readMutation.isPending) readMutation.mutate(selectedId);
    // The message id/unread edge, not mutation identity, controls this one-time acknowledgement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, detailQuery.data?.unread]);

  const mutationError: unknown = command.error ?? noteMutation.error;
  const selected = detailQuery.data;
  const listItems = listQuery.data?.items ?? [];
  const reasonRequired = reason.trim().length < 3;

  return (
    <div className="flex flex-col gap-6">
      {stepUp.dialog}
      <PageHeader
        eyebrow="Koral · Operación humana"
        title="Inbox"
        description="Colas derivadas del estado canónico, ownership optimista y timeline auditable."
        icon={<Inbox aria-hidden="true" className="h-5 w-5" />}
      />
      <Alert variant="warning" title="Entrega humana pendiente">
        El Inbox gestiona ownership, notas y estados reales. La respuesta al canal permanece deshabilitada hasta integrar el contrato de entrega de 1C.
      </Alert>

      <InboxFiltersBar filters={filters} assignees={assigneesQuery.data ?? []} onChange={setFilters} />

      {listQuery.isLoading && <Skeleton className="h-64 w-full" />}
      {listQuery.isError && <ErrorState description={getAdminErrorMessage(listQuery.error)} action={<Button onClick={() => listQuery.refetch()}>Reintentar</Button>} />}
      {listQuery.isSuccess && listItems.length === 0 && <EmptyState title="No hay conversaciones en esta vista" description="Ajusta los filtros o espera una nueva solicitud de atención." />}

      {listQuery.isSuccess && listItems.length > 0 && (
        <div className="grid min-h-[34rem] gap-4 lg:grid-cols-[minmax(18rem,0.8fr)_minmax(0,1.6fr)]">
          <section aria-label="Conversaciones" className="space-y-2 lg:max-h-[70vh] lg:overflow-y-auto lg:pr-1">
            {listItems.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-current={selectedId === item.id ? "true" : undefined}
                onClick={() => setSelectedId(item.id)}
                className={`w-full rounded-2xl border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent ${selectedId === item.id ? "border-brand-accent bg-brand-accent/5" : "border-border-soft bg-white hover:border-brand-dark/30"}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-semibold text-text-main">{item.subject ?? "Conversación sin asunto"}</span>
                  {item.unread && <span className="mt-1 h-2.5 w-2.5 rounded-full bg-brand-accent" aria-label="No leída" />}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge variant="neutral">{STATUS_LABELS[item.status]}</Badge>
                  <Badge variant="neutral">{item.priority}</Badge>
                  <SlaBadge state={item.slaState} />
                </div>
                <p className="mt-2 text-xs text-text-muted">{item.activeAssignee?.displayName ?? "Sin asignar"} · {formatDateTime(item.lastMessageAt)}</p>
              </button>
            ))}
          </section>

          <section aria-live="polite" aria-label="Detalle de conversación" className="min-w-0 rounded-2xl border border-border-soft bg-white p-4 shadow-e1 sm:p-6">
            {!selectedId && <EmptyState icon={<MessageSquareText className="h-6 w-6" />} title="Selecciona una conversación" description="Aquí verás mensajes, ownership, notas y acciones disponibles." />}
            {selectedId && detailQuery.isLoading && <Skeleton className="h-80 w-full" />}
            {selectedId && detailQuery.isError && <ErrorState description={getAdminErrorMessage(detailQuery.error)} action={<Button onClick={() => detailQuery.refetch()}>Recargar conversación</Button>} />}
            {selected && <ConversationDetail detail={selected} currentActorId={user?.id ?? ""} canManage={canManage} assignees={assigneesQuery.data ?? []} assigneeUserId={assigneeUserId} setAssigneeUserId={setAssigneeUserId} reason={reason} setReason={setReason} reasonRequired={reasonRequired} command={command} note={note} setNote={setNote} noteMutation={noteMutation} />}
          </section>
        </div>
      )}

      {Boolean(mutationError) && !isStepUpCancelledError(mutationError) && (
        <Alert variant="danger" title={mutationError instanceof ApiError && mutationError.status === 409 ? "La conversación cambió" : "No se pudo completar la acción"}>
          {getAdminErrorMessage(mutationError)} {mutationError instanceof ApiError && mutationError.status === 429 && mutationError.retryAfterSeconds ? `Reintenta en ${mutationError.retryAfterSeconds} segundos.` : ""}
        </Alert>
      )}
    </div>
  );
}

function InboxFiltersBar({ filters, assignees, onChange }: { filters: InboxFilters; assignees: Array<{ id: string; displayName: string }>; onChange: (filters: InboxFilters) => void }) {
  const patch = (value: Partial<InboxFilters>) => onChange({ ...filters, ...value, page: 1 });
  return (
    <form role="search" className="grid gap-3 rounded-2xl border border-border-soft bg-white p-4 sm:grid-cols-2 xl:grid-cols-6" onSubmit={(event) => event.preventDefault()}>
      <label className="sm:col-span-2 xl:col-span-2"><span className="mb-1 block text-sm font-medium">Buscar</span><span className="relative block"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" aria-hidden="true" /><Input type="search" value={filters.search ?? ""} onChange={(event) => patch({ search: event.target.value })} placeholder="Asunto, participante o etiqueta" className="pl-9" /></span></label>
      <FilterSelect label="Cola" value={filters.queue ?? "ALL"} onChange={(value) => patch({ queue: value as ConversationQueueView })} options={[["ALL", "Todas"], ["MINE", "Mis conversaciones"], ["UNASSIGNED", "Sin asignar"], ["HUMAN_REQUIRED", "Requieren atención"]]} />
      <FilterSelect label="Estado" value={filters.status ?? ""} onChange={(value) => patch({ status: (value || undefined) as ConversationStatus | undefined })} options={[["", "Todos"], ...STATUSES.map((status) => [status, STATUS_LABELS[status]])]} />
      <FilterSelect label="Prioridad" value={filters.priority ?? ""} onChange={(value) => patch({ priority: (value || undefined) as ConversationPriority | undefined })} options={[["", "Todas"], ...PRIORITIES.map((priority) => [priority, priority])]} />
      <FilterSelect label="Responsable" value={filters.assigneeUserId ?? ""} onChange={(value) => patch({ assigneeUserId: value || undefined })} options={[["", "Cualquiera"], ...assignees.map((assignee) => [assignee.id, assignee.displayName])]} />
    </form>
  );
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[][] }) {
  return <label><span className="mb-1 block text-sm font-medium">{label}</span><Select value={value} onChange={(event) => onChange(event.target.value)}>{options.map(([optionValue, text]) => <option key={optionValue} value={optionValue}>{text}</option>)}</Select></label>;
}

function ConversationDetail({ detail, currentActorId, canManage, assignees, assigneeUserId, setAssigneeUserId, reason, setReason, reasonRequired, command, note, setNote, noteMutation }: {
  detail: InboxConversationDetail;
  currentActorId: string;
  canManage: boolean;
  assignees: Array<{ id: string; displayName: string }>;
  assigneeUserId: string;
  setAssigneeUserId: (value: string) => void;
  reason: string;
  setReason: (value: string) => void;
  reasonRequired: boolean;
  command: ReturnType<typeof useMutation<unknown, Error, "assign" | "release" | "return" | "priority" | "resolve" | "close">>;
  note: string;
  setNote: (value: string) => void;
  noteMutation: ReturnType<typeof useMutation<unknown, Error, void>>;
}) {
  const ownedByCurrent = detail.activeAssignee?.id === currentActorId;
  return <div className="space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-display text-xl font-semibold">{detail.subject ?? "Conversación sin asunto"}</h2><p className="mt-1 text-sm text-text-muted">Versión {detail.version} · {detail.channels.join(", ") || "Canal no disponible"}</p></div><StatusBadge tone={detail.status === "HUMAN_ACTIVE" ? "warning" : detail.status === "CLOSED" ? "inactive" : "active"} label={STATUS_LABELS[detail.status]} /></header>
    {detail.status === "HUMAN_ACTIVE" && <Alert variant="warning" title="Autorrespuesta de Koral deshabilitada">La conversación está bajo control humano. Koral no responderá automáticamente.</Alert>}
    <section aria-labelledby="messages-heading"><h3 id="messages-heading" className="font-semibold">Mensajes</h3><ol className="mt-3 max-h-72 space-y-3 overflow-y-auto" aria-label="Historial de mensajes">{detail.messages.map((message) => <li key={message.id} className={`max-w-[90%] rounded-2xl p-3 text-sm ${message.direction === "INBOUND" ? "bg-surface-muted" : "ml-auto bg-brand-dark text-white"}`}><p className="whitespace-pre-wrap break-words">{message.body ?? `[${message.contentType}]`}</p><time className="mt-1 block text-xs opacity-70">{formatDateTime(message.occurredAt)}</time></li>)}</ol></section>
    {canManage && <section aria-labelledby="actions-heading" className="space-y-3 border-t border-border-soft pt-4"><h3 id="actions-heading" className="font-semibold">Gestión humana</h3><div className="grid gap-3 sm:grid-cols-2"><label><span className="mb-1 block text-sm">Responsable</span><Select value={assigneeUserId} onChange={(event) => setAssigneeUserId(event.target.value)}><option value="">Selecciona</option>{assignees.map((assignee) => <option key={assignee.id} value={assignee.id}>{assignee.displayName}</option>)}</Select></label><label><span className="mb-1 block text-sm">Motivo de la acción</span><Input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} /></label></div><div className="flex flex-wrap gap-2"><Button size="sm" disabled={!assigneeUserId || (Boolean(detail.activeAssignee) && reasonRequired) || command.isPending} onClick={() => command.mutate("assign")}>{detail.activeAssignee ? "Transferir / takeover" : "Asignar"}</Button>{ownedByCurrent && <><Button size="sm" variant="outline" disabled={reasonRequired || command.isPending} onClick={() => command.mutate("release")}>Liberar</Button><Button size="sm" variant="outline" disabled={reasonRequired || command.isPending} onClick={() => command.mutate("return")}>Devolver a Koral</Button></>}<Button size="sm" variant="outline" disabled={reasonRequired || command.isPending || detail.status === "CLOSED"} onClick={() => command.mutate("priority")}>Alternar urgente</Button><Button size="sm" variant="outline" disabled={reasonRequired || command.isPending || detail.status === "CLOSED"} onClick={() => command.mutate("resolve")}>Resolver</Button><Button size="sm" variant="outline" disabled={reasonRequired || command.isPending || detail.status === "CLOSED"} onClick={() => command.mutate("close")}>Cerrar</Button></div></section>}
    <section aria-labelledby="reply-heading" className="rounded-2xl border border-border-soft bg-surface-muted p-4"><h3 id="reply-heading" className="font-semibold">Respuesta al usuario</h3><p className="mt-1 text-sm text-text-muted">UNAVAILABLE: pendiente del contrato canónico de entrega humana del runtime 1C. No se simula ni se persiste un envío.</p><Button className="mt-3" disabled title="Entrega humana aún no disponible">Enviar respuesta</Button></section>
    {canManage && <section aria-labelledby="notes-heading"><h3 id="notes-heading" className="font-semibold">Notas internas</h3><ul className="mt-2 space-y-2">{detail.internalNotes.map((item) => <li key={item.id} className="rounded-xl bg-surface-muted p-3 text-sm"><p>{item.body}</p><p className="mt-1 text-xs text-text-muted">{item.author.displayName} · {formatDateTime(item.createdAt)}</p></li>)}</ul><label className="mt-3 block"><span className="sr-only">Nueva nota interna</span><Input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Añadir nota interna" maxLength={10_000} /></label><Button className="mt-2" size="sm" variant="outline" disabled={!note.trim() || noteMutation.isPending} onClick={() => noteMutation.mutate()}>Guardar nota</Button></section>}
  </div>;
}

function SlaBadge({ state }: { state: InboxConversationDetail["slaState"] }) {
  if (state === "NONE") return null;
  return <Badge variant={state === "OVERDUE" ? "danger" : state === "DUE_SOON" ? "warning" : "neutral"}><Clock3 className="mr-1 inline h-3 w-3" aria-hidden="true" />{state === "OVERDUE" ? "SLA vencido" : state === "DUE_SOON" ? "SLA próximo" : "SLA en curso"}</Badge>;
}

function formatDateTime(value: string | null): string {
  return value ? new Date(value).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" }) : "Sin mensajes";
}
