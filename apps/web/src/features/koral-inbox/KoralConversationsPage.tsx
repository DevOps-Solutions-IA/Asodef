import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Alert, Badge, Button, EmptyState, ErrorState, Input, PageHeader, Select, Skeleton, StatusBadge } from "@asodef/ui";
import { MessagesSquare, Search } from "lucide-react";
import { getAdminErrorMessage } from "../../lib/admin/admin-error-messages";
import { getInboxConversation, koralInboxKeys, listInboxConversations } from "./koral-inbox.api";
import type { ConversationChannel, ConversationStatus, InboxConversationDetail, InboxFilters } from "./koral-inbox.types";

const STATUS_LABELS: Record<ConversationStatus, string> = {
  AI_ACTIVE: "Koral activo", WAITING_USER: "Esperando usuario", HUMAN_REQUIRED: "Requiere asesor",
  HUMAN_ACTIVE: "Atención humana", WAITING_INTERNAL: "Espera interna", RESOLVED: "Resuelta", CLOSED: "Cerrada",
};
const STATUSES = Object.keys(STATUS_LABELS) as ConversationStatus[];
const CHANNELS: ConversationChannel[] = ["WEB", "WHATSAPP", "INSTAGRAM", "MESSENGER", "FUTURE"];

export function KoralConversationsPage() {
  const [filters, setFilters] = useState<InboxFilters>({ page: 1, pageSize: 30 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const list = useQuery({ queryKey: koralInboxKeys.list(filters), queryFn: ({ signal }) => listInboxConversations(filters, signal) });
  const detail = useQuery({ queryKey: koralInboxKeys.detail(selectedId ?? "none"), queryFn: ({ signal }) => getInboxConversation(selectedId!, signal), enabled: Boolean(selectedId) });
  const patch = (value: Partial<InboxFilters>) => setFilters((current) => ({ ...current, ...value, page: value.page ?? 1 }));
  const items = list.data?.items ?? [];
  const page = list.data?.page ?? filters.page ?? 1;
  const pageSize = list.data?.pageSize ?? filters.pageSize ?? 30;
  const hasNext = Boolean(list.data && page * pageSize < list.data.total);

  return <div className="flex flex-col gap-6">
    <PageHeader eyebrow="Koral · Trazabilidad" title="Conversaciones" description="Consulta read-only del historial, canales, ownership y decisiones auditables del runtime canónico." icon={<MessagesSquare aria-hidden="true" className="h-5 w-5" />} actions={<StatusBadge tone="success" label="RUNTIME REAL · SOLO LECTURA" />} />
    <form role="search" className="grid gap-3 rounded-2xl border border-border-soft bg-white p-4 md:grid-cols-4" onSubmit={(event) => event.preventDefault()}>
      <label className="md:col-span-2"><span className="mb-1 block text-sm font-medium">Buscar</span><span className="relative block"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" aria-hidden="true" /><Input className="pl-9" type="search" value={filters.search ?? ""} onChange={(event) => patch({ search: event.target.value })} placeholder="Asunto, participante o etiqueta" /></span></label>
      <Filter label="Estado" value={filters.status ?? ""} options={[["", "Todos"], ...STATUSES.map((status) => [status, STATUS_LABELS[status]])]} onChange={(value) => patch({ status: (value || undefined) as ConversationStatus | undefined })} />
      <Filter label="Canal" value={filters.channel ?? ""} options={[["", "Todos"], ...CHANNELS.map((channel) => [channel, channel])]} onChange={(value) => patch({ channel: (value || undefined) as ConversationChannel | undefined })} />
    </form>
    {list.isPending && <Skeleton className="h-64 w-full" />}
    {list.isError && <ErrorState description={getAdminErrorMessage(list.error)} action={<Button onClick={() => list.refetch()}>Reintentar</Button>} />}
    {list.isSuccess && items.length === 0 && <EmptyState title="No hay conversaciones" description="No existen resultados para los filtros seleccionados." />}
    {list.isSuccess && items.length > 0 && <div className="grid gap-4 lg:grid-cols-[minmax(18rem,.8fr)_minmax(0,1.6fr)]">
      <section aria-label="Conversaciones" className="space-y-2">{items.map((item) => <button key={item.id} type="button" aria-current={selectedId === item.id ? "true" : undefined} onClick={() => setSelectedId(item.id)} className="w-full rounded-2xl border border-border-soft bg-white p-4 text-left"><span className="font-semibold">{item.subject ?? "Conversación sin asunto"}</span><span className="mt-1 block break-all text-xs text-text-muted">ID {item.id}</span><div className="mt-2 flex flex-wrap gap-2"><Badge variant="neutral">{STATUS_LABELS[item.status]}</Badge><Badge variant="neutral">{item.channels.join(", ") || "Sin canal"}</Badge></div><p className="mt-2 text-xs text-text-muted">{item.activeAssignee?.displayName ?? "Sin asignar"} · versión {item.version} · actualizada {formatDateTime(item.updatedAt)}</p></button>)}</section>
      <section aria-live="polite" aria-label="Detalle de conversación" className="rounded-2xl border border-border-soft bg-white p-5">{!selectedId && <EmptyState title="Selecciona una conversación" description="El detalle es consultivo y no permite mutaciones." />}{selectedId && detail.isPending && <Skeleton className="h-72 w-full" />}{selectedId && detail.isError && <ErrorState description={getAdminErrorMessage(detail.error)} action={<Button onClick={() => detail.refetch()}>Recargar conversación</Button>} />}{detail.data && <ConversationReadDetail detail={detail.data} />}</section>
    </div>}
    {list.isSuccess && list.data.total > pageSize && <nav aria-label="Paginación de conversaciones" className="flex items-center justify-between"><Button variant="outline" disabled={page <= 1} onClick={() => patch({ page: page - 1 })}>Anterior</Button><span className="text-sm text-text-muted">Página {page}</span><Button variant="outline" disabled={!hasNext} onClick={() => patch({ page: page + 1 })}>Siguiente</Button></nav>}
  </div>;
}

function ConversationReadDetail({ detail }: { detail: InboxConversationDetail }) {
  return (
    <div className="space-y-5">
      <header>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-xl font-semibold">{detail.subject ?? "Conversación sin asunto"}</h2>
          <StatusBadge tone={detail.status === "CLOSED" ? "inactive" : detail.status === "HUMAN_ACTIVE" ? "warning" : "active"} label={STATUS_LABELS[detail.status]} />
        </div>
        <p className="mt-1 text-sm text-text-muted">Versión {detail.version} · {detail.channels.join(", ") || "Canal no disponible"}</p>
      </header>
      {detail.status === "HUMAN_ACTIVE" && (
        <Alert variant="warning" title="Autorrespuesta de Koral deshabilitada">
          HUMAN_ACTIVE mantiene AI_AUTORESPONSE=OFF mientras exista ownership humano activo.
        </Alert>
      )}
      <dl className="grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
        <Meta term="Responsable" value={detail.activeAssignee?.displayName ?? "Sin asignar"} />
        <Meta term="Prioridad" value={detail.priority} />
        <Meta term="SLA" value={detail.slaState} />
        <Meta term="Creada" value={formatDateTime(detail.createdAt)} />
        <Meta term="Actualizada" value={formatDateTime(detail.updatedAt)} />
        <Meta term="Etiquetas" value={detail.tags.join(", ") || "Sin etiquetas"} />
      </dl>
      <section>
        <h3 className="font-semibold">Mensajes</h3>
        {detail.messages.length === 0 ? <p className="mt-2 text-sm text-text-muted">Sin mensajes disponibles.</p> : (
          <ol className="mt-3 space-y-3">
            {detail.messages.map((message) => (
              <li key={message.id} className="rounded-xl bg-surface-muted p-3 text-sm">
                <div className="flex flex-wrap justify-between gap-2"><strong>{message.direction}</strong><time className="text-xs text-text-muted">{formatDateTime(message.occurredAt)}</time></div>
                <p className="mt-1 whitespace-pre-wrap break-words">{message.body ?? `[${message.contentType}]`}</p>
                {message.correlationId && <p className="mt-2 break-all text-xs text-text-muted">Correlación: {message.correlationId}</p>}
              </li>
            ))}
          </ol>
        )}
      </section>
      <section>
        <h3 className="font-semibold">Ownership y asignaciones</h3>
        {detail.assignments.length === 0 ? <p className="mt-2 text-sm text-text-muted">Sin asignaciones.</p> : (
          <ol className="mt-3 space-y-2">{detail.assignments.map((assignment) => <li key={assignment.id} className="rounded-xl border border-border-soft p-3 text-sm"><strong>{assignment.assignee.displayName}</strong><span className="block text-xs text-text-muted">Asignada por {assignment.assignedBy.displayName} · {formatDateTime(assignment.assignedAt)}{assignment.releasedAt ? ` · liberada ${formatDateTime(assignment.releasedAt)}` : " · activa"}</span></li>)}</ol>
        )}
      </section>
      <section>
        <h3 className="font-semibold">Identity assurance</h3>
        {detail.identityTimeline.length === 0 ? <p className="mt-2 text-sm text-text-muted">Sin cambios de assurance registrados.</p> : (
          <ol className="mt-3 space-y-2">{detail.identityTimeline.map((binding) => <li key={binding.id} className="rounded-xl border border-border-soft p-3 text-sm"><strong>{binding.previousAssurance ?? "Sin assurance"} → {binding.newAssurance}</strong><span className="block text-xs text-text-muted">{binding.reason} · {formatDateTime(binding.createdAt)}</span><span className="block break-all text-xs text-text-muted">Correlación: {binding.correlationId}</span></li>)}</ol>
        )}
      </section>
      <section>
        <h3 className="font-semibold">Trazas de Knowledge</h3>
        {detail.knowledgeRetrievals.length === 0 ? <p className="mt-2 text-sm text-text-muted">Sin retrieval de Knowledge asociado.</p> : (
          <ol className="mt-3 space-y-2">{detail.knowledgeRetrievals.map((retrieval) => <li key={retrieval.id} className="rounded-xl border border-border-soft p-3 text-sm"><strong>{retrieval.result}</strong><span className="block text-xs text-text-muted">Citas: {retrieval.citationCount} · {formatDateTime(retrieval.createdAt)}</span>{retrieval.reasonCode && <span className="block text-xs text-text-muted">Razón: {retrieval.reasonCode}</span>}<span className="block break-all text-xs text-text-muted">Correlación: {retrieval.correlationId}</span></li>)}</ol>
        )}
      </section>
      <section>
        <h3 className="font-semibold">Timeline auditable</h3>
        {detail.events.length === 0 ? <p className="mt-2 text-sm text-text-muted">Sin eventos registrados.</p> : (
          <ol className="mt-3 space-y-2">{detail.events.map((event) => <li key={event.id} className="rounded-xl border border-border-soft p-3 text-sm"><div className="flex flex-wrap justify-between gap-2"><strong>{event.eventType}</strong><time className="text-xs text-text-muted">{formatDateTime(event.createdAt)}</time></div><span className="block text-xs text-text-muted">{event.previousStatus ?? "—"} → {event.newStatus ?? "—"} · {event.result}</span>{event.reason && <span className="block text-xs text-text-muted">Motivo: {event.reason}</span>}{event.correlationId && <span className="block break-all text-xs text-text-muted">Correlación: {event.correlationId}</span>}</li>)}</ol>
        )}
      </section>
    </div>
  );
}
function Filter({ label, value, options, onChange }: { label: string; value: string; options: string[][]; onChange: (value: string) => void }) { return <label><span className="mb-1 block text-sm font-medium">{label}</span><Select value={value} onChange={(event) => onChange(event.target.value)}>{options.map(([key, text]) => <option key={key} value={key}>{text}</option>)}</Select></label>; }
function Meta({ term, value }: { term: string; value: string }) { return <div><dt className="text-xs uppercase tracking-wide text-text-muted">{term}</dt><dd className="mt-1 font-medium">{value}</dd></div>; }
function formatDateTime(value: string): string { return new Date(value).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" }); }
