import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, BellRing, Database, RefreshCw, Server, Waypoints } from "lucide-react";
import { Button, cn, ErrorState, PageHeader, Skeleton, StatusBadge, type StatusTone } from "@asodef/ui";
import { getAdminSystemStatus } from "../../lib/admin/admin-system-api";
import type { AdminSystemStatus, OperationalStatus } from "../../lib/admin/admin-system-types";
import { getAdminErrorMessage } from "../../lib/admin/admin-error-messages";
import { queryKeys } from "../../lib/query-keys";

const STATUS_PRESENTATION: Record<OperationalStatus, { label: string; tone: StatusTone }> = {
  AVAILABLE: { label: "Disponible", tone: "success" },
  UNAVAILABLE: { label: "No disponible", tone: "failed" },
  NOT_CONFIGURED: { label: "No configurado", tone: "inactive" },
  UNKNOWN: { label: "Desconocido", tone: "draft" },
};

export function AdminSystemPage() {
  const query = useQuery({
    queryKey: queryKeys.admin.system(),
    queryFn: ({ signal }) => getAdminSystemStatus(signal),
  });

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Operación y dependencias"
        icon={<Server className="h-5 w-5" />}
        title="Estado del sistema"
        description="Lectura operativa en vivo. Los estados desconocidos o no configurados nunca se presentan como saludables."
        actions={(
          <Button type="button" variant="secondary" onClick={() => void query.refetch()} disabled={query.isFetching}>
            <RefreshCw aria-hidden="true" className={cn("h-4 w-4", query.isFetching && "animate-spin motion-reduce:animate-none")} />
            Actualizar
          </Button>
        )}
      />

      {query.isLoading && <SystemSkeleton />}
      {query.isError && <ErrorState description={getAdminErrorMessage(query.error)} />}
      {query.isSuccess && <SystemSnapshot data={query.data} />}
    </div>
  );
}

function SystemSnapshot({ data }: { data: AdminSystemStatus }) {
  return (
    <>
      <section aria-labelledby="dependencies-heading" className="flex flex-col gap-4">
        <div>
          <h2 id="dependencies-heading" className="font-display text-lg font-semibold text-text-main">Dependencias</h2>
          <p className="mt-1 text-sm text-text-muted">Estado observado al generar esta lectura; no sustituye una investigación de incidentes.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatusCard title="API" status={data.api.status} detail={`Uptime ${formatDuration(data.api.uptimeSeconds)}`} icon={<Server />} />
          <StatusCard title="PostgreSQL" status={data.dependencies.postgres.status} detail={formatLatency(data.dependencies.postgres.latencyMs)} icon={<Database />} />
          <StatusCard title="Redis" status={data.dependencies.redis.status} detail={formatLatency(data.dependencies.redis.latencyMs)} icon={<Waypoints />} />
          <StatusCard title="Master / Firebird" status={data.dependencies.master.status} detail={formatLatency(data.dependencies.master.latencyMs)} icon={<Database />} />
        </div>
      </section>

      <section aria-labelledby="notifications-heading" className="data-surface p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="notifications-heading" className="flex items-center gap-2 font-display text-lg font-semibold text-text-main">
              <BellRing aria-hidden="true" className="h-5 w-5 text-brand-dark" /> Notificaciones
            </h2>
            <p className="mt-1 text-sm text-text-muted">Cola durable y entregas que requieren atención operativa.</p>
          </div>
          <OperationalBadge status={data.notifications.status} />
        </div>
        <dl className="mt-5 grid gap-3 sm:grid-cols-3">
          <CountMetric label="Pendientes en cola" value={data.notifications.backlog} />
          <CountMetric label="Fallidas / resultado incierto" value={data.notifications.failed} attention />
          <CountMetric label="Dead letter" value={data.notifications.deadLetter} attention />
        </dl>
      </section>

      <section aria-labelledby="release-heading" className="data-surface p-5 sm:p-6">
        <h2 id="release-heading" className="font-display text-lg font-semibold text-text-main">Release</h2>
        <dl className="mt-4 grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
          <TextMetric label="SHA" value={data.api.releaseSha} />
          <TextMetric label="Versión API" value={data.api.version} />
          <TextMetric label="Migración" value={data.api.migrationVersion} />
          <TextMetric label="Lectura generada" value={formatTimestamp(data.generatedAt)} />
        </dl>
      </section>
    </>
  );
}

function StatusCard({ title, status, detail, icon }: { title: string; status: OperationalStatus; detail: string; icon: React.ReactNode }) {
  const degraded = status !== "AVAILABLE";
  return (
    <article className={cn("rounded-2xl border bg-white p-5 shadow-e1", degraded ? "border-warning/30" : "border-border-soft")}>
      <div className="flex items-center justify-between gap-3">
        <span aria-hidden="true" className={cn("[&>svg]:h-5 [&>svg]:w-5", degraded ? "text-warning" : "text-brand-dark")}>{icon}</span>
        <OperationalBadge status={status} />
      </div>
      <h3 className="mt-4 font-semibold text-text-main">{title}</h3>
      <p className="mt-1 text-sm text-text-muted">{detail}</p>
    </article>
  );
}

function OperationalBadge({ status }: { status: OperationalStatus }) {
  const presentation = STATUS_PRESENTATION[status];
  return <StatusBadge tone={presentation.tone} label={presentation.label} />;
}

function CountMetric({ label, value, attention = false }: { label: string; value: number | null; attention?: boolean }) {
  const unknown = value == null;
  const needsAttention = attention && value != null && value > 0;
  return (
    <div className={cn("rounded-xl border p-4", needsAttention ? "border-warning/30 bg-warning/5" : "border-border-soft bg-bg-soft/40")}>
      <dt className="text-sm text-text-muted">{label}</dt>
      <dd className="mt-2 flex items-center gap-2 font-display text-2xl font-semibold tabular-nums text-text-main">
        {needsAttention && <AlertTriangle aria-hidden="true" className="h-4 w-4 text-warning" />}
        {unknown ? "Desconocido" : value.toLocaleString("es-CO")}
      </dd>
    </div>
  );
}

function TextMetric({ label, value }: { label: string; value: string }) {
  const unknown = !value || value === "UNKNOWN";
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-text-muted">{label}</dt>
      <dd className={cn("mt-1 break-all text-sm font-medium", unknown ? "text-warning" : "text-text-main")}>
        {unknown ? "Desconocido" : value}
      </dd>
    </div>
  );
}

function SystemSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true">
      <span role="status" className="sr-only">Cargando estado del sistema…</span>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-36 w-full" />)}
      </div>
      <Skeleton className="h-44 w-full" />
    </div>
  );
}

function formatLatency(latencyMs: number): string {
  return Number.isFinite(latencyMs) && latencyMs >= 0 ? `${latencyMs.toLocaleString("es-CO")} ms` : "Latencia desconocida";
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "desconocido";
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  return days > 0 ? `${days} d ${hours} h` : hours > 0 ? `${hours} h ${minutes} min` : `${minutes} min`;
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Desconocido" : new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short" }).format(date);
}
