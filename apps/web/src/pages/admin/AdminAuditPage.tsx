import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ScrollText } from "lucide-react";
import { Badge, Button, EmptyState, ErrorState, Input, PageHeader, Select, Skeleton, StatusBadge } from "@asodef/ui";
import { listAuditTimeline } from "../../lib/admin/audit-timeline-api";
import type { AuditTimelineResult, AuditTimelineSource } from "../../lib/admin/audit-timeline-types";
import { getAdminErrorMessage } from "../../lib/admin/admin-error-messages";
import { queryKeys } from "../../lib/query-keys";

const PAGE_SIZE = 20;

export function AdminAuditPage() {
  const [page, setPage] = useState(1);
  const [cursors, setCursors] = useState<Array<string | undefined>>([undefined]);
  const [source, setSource] = useState<AuditTimelineSource>("ALL");
  const [result, setResult] = useState<AuditTimelineResult | "">("");
  const [action, setAction] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const filters = {
    source,
    result: result || undefined,
    action: action.trim() || undefined,
    from: dateBoundary(from, false),
    to: dateBoundary(to, true),
    cursor: cursors[page - 1],
    pageSize: PAGE_SIZE,
  };
  const query = useQuery({
    queryKey: queryKeys.admin.audit(filters),
    queryFn: ({ signal }) => listAuditTimeline(filters, signal),
  });

  const resetPage = () => { setPage(1); setCursors([undefined]); };
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Gobierno y trazabilidad"
        icon={<ScrollText className="h-5 w-5" />}
        title="Auditoría"
        description="Timeline unificado de cambios de negocio y eventos de seguridad. Los datos no disponibles se muestran como desconocidos."
      />

      <div className="grid gap-3 rounded-2xl border border-border-soft bg-white p-4 shadow-e1 sm:grid-cols-2 xl:grid-cols-5">
        <Filter label="Fuente" htmlFor="audit-source">
          <Select id="audit-source" value={source} onChange={(event) => { setSource(event.target.value as AuditTimelineSource); resetPage(); }}>
            <option value="ALL">Todas</option>
            <option value="AUDIT">Cambios de negocio</option>
            <option value="SECURITY">Seguridad</option>
          </Select>
        </Filter>
        <Filter label="Resultado" htmlFor="audit-result">
          <Select id="audit-result" value={result} onChange={(event) => { setResult(event.target.value as AuditTimelineResult | ""); resetPage(); }}>
            <option value="">Todos</option>
            <option value="SUCCESS">Aplicado</option>
            <option value="NO_OP">No aplicado</option>
            <option value="UNKNOWN">Desconocido</option>
          </Select>
        </Filter>
        <Filter label="Acción exacta" htmlFor="audit-action">
          <Input id="audit-action" value={action} maxLength={100} placeholder="LOGIN_FAILED" onChange={(event) => { setAction(event.target.value); resetPage(); }} />
        </Filter>
        <Filter label="Desde" htmlFor="audit-from">
          <Input id="audit-from" type="date" value={from} onChange={(event) => { setFrom(event.target.value); resetPage(); }} />
        </Filter>
        <Filter label="Hasta" htmlFor="audit-to">
          <Input id="audit-to" type="date" value={to} onChange={(event) => { setTo(event.target.value); resetPage(); }} />
        </Filter>
      </div>

      {query.isLoading && (
        <div className="space-y-3">
          <TimelineSkeleton />
          {page > 1 && (
            <div className="flex gap-2">
              <PreviousPageButton disabled onPrevious={() => undefined} />
              <Button type="button" variant="outline" disabled>Siguiente</Button>
            </div>
          )}
        </div>
      )}
      {query.isError && (
        <div className="space-y-3">
          <ErrorState description={getAdminErrorMessage(query.error)} />
          {page > 1 && <PreviousPageButton disabled={query.isFetching} onPrevious={() => setPage((current) => Math.max(1, current - 1))} />}
        </div>
      )}
      {query.isSuccess && query.data.items.length === 0 && (
        <div className="space-y-3">
          <EmptyState title="Sin eventos para los filtros seleccionados" />
          {page > 1 && <PreviousPageButton disabled={query.isFetching} onPrevious={() => setPage((current) => Math.max(1, current - 1))} />}
        </div>
      )}
      {query.isSuccess && query.data.items.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-2xl border border-border-soft bg-white shadow-e1">
            <table className="w-full min-w-[900px] text-left text-sm">
              <caption className="sr-only">Timeline de auditoría</caption>
              <thead className="bg-brand-dark-50 text-xs font-semibold uppercase tracking-wide text-brand-dark">
                <tr>
                  <th className="px-4 py-3" scope="col">Fecha</th>
                  <th className="px-4 py-3" scope="col">Fuente</th>
                  <th className="px-4 py-3" scope="col">Acción</th>
                  <th className="px-4 py-3" scope="col">Resultado</th>
                  <th className="px-4 py-3" scope="col">Actor / entidad</th>
                  <th className="px-4 py-3" scope="col">Trazabilidad</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-soft">
                {query.data.items.map((item) => (
                  <tr key={item.id}>
                    <td className="whitespace-nowrap px-4 py-3">{formatDate(item.timestamp)}</td>
                    <td className="px-4 py-3"><Badge>{item.source === "AUDIT" ? "Negocio" : "Seguridad"}</Badge></td>
                    <td className="px-4 py-3 font-mono text-xs">{item.action}</td>
                    <td className="px-4 py-3"><ResultBadge result={item.result} /></td>
                    <td className="px-4 py-3 text-xs text-text-muted">
                      <p>Actor: <Identifier value={item.actorId} /></p>
                      <p>{item.entityType ?? "Entidad desconocida"}: <Identifier value={item.entityId} /></p>
                    </td>
                    <td className="px-4 py-3 text-xs text-text-muted">
                      <p>Request: <Identifier value={item.requestId} /></p>
                      <p>Correlación: <Identifier value={item.correlationId} /></p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-text-muted">Página {page} · {query.data.total.toLocaleString("es-CO")} eventos encontrados</p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" disabled={page === 1 || query.isFetching} onClick={() => setPage((current) => Math.max(1, current - 1))}>Anterior</Button>
              <Button
                type="button"
                variant="outline"
                disabled={!query.data.nextCursor || query.isFetching}
                onClick={() => {
                  if (!query.data.nextCursor) return;
                  setCursors((current) => [...current.slice(0, page), query.data.nextCursor!]);
                  setPage((current) => current + 1);
                }}
              >Siguiente</Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function PreviousPageButton({ disabled, onPrevious }: { disabled: boolean; onPrevious: () => void }) {
  return <Button type="button" variant="outline" disabled={disabled} onClick={onPrevious}>Anterior</Button>;
}

function Filter({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return <label htmlFor={htmlFor} className="flex flex-col gap-1.5 text-sm font-medium text-text-main">{label}{children}</label>;
}

function ResultBadge({ result }: { result: AuditTimelineResult }) {
  if (result === "SUCCESS") return <StatusBadge tone="success" label="Aplicado" />;
  if (result === "NO_OP") return <StatusBadge tone="inactive" label="No aplicado" />;
  return <StatusBadge tone="draft" label="Desconocido" />;
}

function Identifier({ value }: { value: string | null }) {
  return <span className={value ? "font-mono" : "text-warning"}>{value ?? "Desconocido"}</span>;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Desconocido" : date.toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" });
}

function dateBoundary(value: string, endOfDay: boolean): string | undefined {
  if (!value) return undefined;
  const local = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}`);
  return Number.isNaN(local.getTime()) ? undefined : local.toISOString();
}

function TimelineSkeleton() {
  return <div className="space-y-2" aria-busy="true"><span className="sr-only" role="status">Cargando auditoría…</span>{Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-16 w-full" />)}</div>;
}
