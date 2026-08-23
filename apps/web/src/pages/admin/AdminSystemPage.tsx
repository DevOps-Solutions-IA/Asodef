import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  BellRing,
  Database,
  RefreshCw,
  Server,
  Waypoints,
} from "lucide-react";
import {
  Alert,
  Button,
  cn,
  ErrorState,
  PageHeader,
  Skeleton,
  StatusBadge,
  type StatusTone,
} from "@asodef/ui";
import { getAdminSystemStatus } from "../../lib/admin/admin-system-api";
import { getAdminErrorMessage } from "../../lib/admin/admin-error-messages";
import type {
  AdminSystemStatus,
  HealthState,
  TechnicalComponentStatus,
} from "../../lib/admin/admin-system-types";
import { queryKeys } from "../../lib/query-keys";

const SECTIONS = [
  "resumen",
  "servicios",
  "integraciones",
  "proveedores",
  "notificaciones",
  "versiones",
  "seguridad",
  "diagnostico",
] as const;
type SystemSection = (typeof SECTIONS)[number];
const SECTION_LABELS: Record<SystemSection, string> = {
  resumen: "Resumen",
  servicios: "Servicios",
  integraciones: "Integraciones",
  proveedores: "Proveedores",
  notificaciones: "Notificaciones",
  versiones: "Versiones",
  seguridad: "Seguridad técnica",
  diagnostico: "Diagnóstico",
};

const STATE_PRESENTATION: Record<
  HealthState,
  { label: string; tone: StatusTone }
> = {
  HEALTHY: { label: "Operativo", tone: "success" },
  DEGRADED: { label: "Degradado", tone: "warning" },
  UNAVAILABLE: { label: "No disponible", tone: "failed" },
  UNKNOWN: { label: "Desconocido", tone: "draft" },
  NOT_CONFIGURED: { label: "No configurado", tone: "inactive" },
  DISABLED: { label: "Deshabilitado", tone: "inactive" },
};

export function AdminSystemPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get("section");
  const section: SystemSection = SECTIONS.includes(requested as SystemSection)
    ? (requested as SystemSection)
    : "resumen";
  const query = useQuery({
    queryKey: queryKeys.admin.system(),
    queryFn: ({ signal }) => getAdminSystemStatus(signal),
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Administración técnica"
        title="Sistema"
        description="Centro técnico consolidado para servicios, integraciones, entrega, versiones, controles y diagnóstico."
        actions={
          <Button
            type="button"
            variant="secondary"
            onClick={() => void query.refetch()}
            disabled={query.isFetching}
          >
            <RefreshCw
              aria-hidden="true"
              className={cn(
                "h-4 w-4",
                query.isFetching && "animate-spin motion-reduce:animate-none",
              )}
            />
            Actualizar
          </Button>
        }
      />
      <nav
        aria-label="Secciones de Sistema"
        className="overflow-x-auto rounded-2xl border border-border-soft bg-white p-2 shadow-e1"
      >
        <ul className="flex min-w-max gap-1">
          {SECTIONS.map((item) => (
            <li key={item}>
              <button
                type="button"
                aria-current={section === item ? "page" : undefined}
                onClick={() =>
                  setSearchParams(item === "resumen" ? {} : { section: item })
                }
                className={cn(
                  "min-h-11 rounded-xl px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange",
                  section === item
                    ? "bg-brand-dark text-white"
                    : "text-text-muted hover:bg-brand-dark-50 hover:text-brand-dark",
                )}
              >
                {SECTION_LABELS[item]}
              </button>
            </li>
          ))}
        </ul>
      </nav>
      {query.isLoading && <SystemSkeleton />}
      {query.isError && (
        <ErrorState description={getAdminErrorMessage(query.error)} />
      )}
      {query.isSuccess && (
        <SystemSectionView section={section} data={query.data} />
      )}
    </div>
  );
}

function SystemSectionView({
  section,
  data,
}: {
  section: SystemSection;
  data: AdminSystemStatus;
}) {
  if (section === "resumen") return <Overview data={data} />;
  if (section === "servicios") return <Services data={data} />;
  if (section === "integraciones") return <Integrations data={data} />;
  if (section === "proveedores") return <ProviderHealth />;
  if (section === "notificaciones") return <Notifications data={data} />;
  if (section === "versiones") return <Versions data={data} />;
  if (section === "seguridad") return <TechnicalSecurity data={data} />;
  return <Diagnostics data={data} />;
}

function Overview({ data }: { data: AdminSystemStatus }) {
  return (
    <div className="space-y-5">
      <Alert
        variant={
          data.core.state === "HEALTHY"
            ? "success"
            : data.core.state === "DEGRADED"
              ? "warning"
              : "danger"
        }
        title="Núcleo administrativo"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span>{data.core.operationalImpact}</span>
          <HealthBadge state={data.core.state} />
        </div>
      </Alert>
      <section aria-labelledby="core-services-heading" className="space-y-3">
        <h2
          id="core-services-heading"
          className="font-display text-lg font-semibold text-text-main"
        >
          Servicios esenciales
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          <ComponentCard title="API" component={data.api} icon={<Server />} />
          <ComponentCard
            title="PostgreSQL"
            component={data.services.postgres}
            icon={<Database />}
          />
          <ComponentCard
            title="Redis"
            component={data.services.redis}
            icon={<Waypoints />}
          />
        </div>
      </section>
      <section
        aria-labelledby="integration-summary-heading"
        className="space-y-3"
      >
        <h2
          id="integration-summary-heading"
          className="font-display text-lg font-semibold text-text-main"
        >
          Integraciones
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          <ComponentCard
            title="Master / Firebird"
            component={data.integrations.master}
            icon={<Database />}
          />
          <ComponentCard
            title="Bold"
            component={data.integrations.bold}
            icon={<Waypoints />}
          />
          <ComponentCard
            title="SMTP"
            component={data.integrations.smtp}
            icon={<BellRing />}
          />
        </div>
      </section>
    </div>
  );
}

function Services({ data }: { data: AdminSystemStatus }) {
  return (
    <SectionSurface
      id="services-heading"
      title="Servicios internos"
      description="Dependencias que sostienen directamente el panel administrativo."
    >
      <div className="grid gap-4 md:grid-cols-3">
        <ComponentCard title="API" component={data.api} icon={<Server />} />
        <ComponentCard
          title="PostgreSQL"
          component={data.services.postgres}
          icon={<Database />}
        />
        <ComponentCard
          title="Redis"
          component={data.services.redis}
          icon={<Waypoints />}
        />
      </div>
    </SectionSurface>
  );
}

function Integrations({ data }: { data: AdminSystemStatus }) {
  return (
    <SectionSurface
      id="integrations-heading"
      title="Integraciones externas"
      description="Su estado se informa sin convertir una integración opcional en caída del núcleo."
    >
      <div className="grid gap-4 lg:grid-cols-3">
        <ComponentCard
          title="Master / Firebird"
          component={data.integrations.master}
          icon={<Database />}
        />
        <ComponentCard
          title={`Bold · ${data.integrations.bold.mode}`}
          component={data.integrations.bold}
          icon={<Waypoints />}
        />
        <ComponentCard
          title="SMTP"
          component={data.integrations.smtp}
          icon={<BellRing />}
        />
      </div>
    </SectionSurface>
  );
}

function ProviderHealth() {
  const providers = ["OpenRouter", "WhatsApp", "Meta", "Otros proveedores"];
  return (
    <SectionSurface
      id="provider-health-heading"
      title="Salud de proveedores"
      description="Diagnóstico técnico separado de la operación de Koral y Comunicaciones. No se renderizan API keys, tokens ni endpoints internos."
    >
      <Alert variant="warning" title="Provider health UNKNOWN">
        El backend actual no expone estas señales. Conexión, health y uso
        permanecen como desconocidos; la interfaz no infiere disponibilidad
        desde configuración local.
      </Alert>
      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {providers.map((provider) => (
          <article
            key={provider}
            className="rounded-2xl border border-border-soft bg-white p-4 shadow-e1"
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-semibold text-text-main">{provider}</h3>
              <StatusBadge tone="draft" label="UNKNOWN" />
            </div>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-text-muted">Conexión</dt>
                <dd className="font-medium text-warning">UNKNOWN</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-text-muted">Health</dt>
                <dd className="font-medium text-warning">UNKNOWN</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-text-muted">Uso</dt>
                <dd className="font-medium text-text-muted">UNAVAILABLE</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
    </SectionSurface>
  );
}

function Notifications({ data }: { data: AdminSystemStatus }) {
  return (
    <SectionSurface
      id="notifications-heading"
      title="Notificaciones técnicas"
      description="La cola durable y el transporte se evalúan por separado: una cola vacía no demuestra que SMTP esté saludable."
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <StateMetric
          label="Estado de la cola"
          state={data.notifications.queueState}
        />
        <StateMetric
          label="Transporte de entrega"
          state={data.notifications.transportState}
          detail={
            data.notifications.transportConfigured
              ? "SMTP configurado"
              : "Transporte no configurado"
          }
        />
      </div>
      <dl className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <CountMetric label="En cola" value={data.notifications.queued} />
        <CountMetric label="Procesando" value={data.notifications.processing} />
        <CountMetric
          label="Reintento pendiente"
          value={data.notifications.retryPending}
        />
        <CountMetric label="Backlog total" value={data.notifications.backlog} />
        <CountMetric
          label="Fallidas"
          value={data.notifications.failed}
          attention
        />
        <CountMetric
          label="Resultado incierto"
          value={data.notifications.unknownResult}
          attention
        />
        <CountMetric
          label="Dead letter"
          value={data.notifications.deadLetter}
          attention
        />
      </dl>
    </SectionSurface>
  );
}

function Versions({ data }: { data: AdminSystemStatus }) {
  return (
    <SectionSurface
      id="versions-heading"
      title="Versiones"
      description="Metadatos de despliegue de solo lectura; no se habilitan acciones de deploy."
    >
      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <TextMetric label="Release SHA" value={data.api.releaseSha} />
        <TextMetric label="Versión API" value={data.api.version} />
        <TextMetric label="Migración" value={data.api.migrationVersion} />
        <TextMetric
          label="Uptime"
          value={formatDuration(data.api.uptimeSeconds)}
        />
        <TextMetric
          label="Lectura generada"
          value={formatTimestamp(data.generatedAt)}
        />
      </dl>
    </SectionSurface>
  );
}

function TechnicalSecurity({ data }: { data: AdminSystemStatus }) {
  return (
    <SectionSurface
      id="technical-security-heading"
      title="Seguridad técnica"
      description="Señales de plataforma; la contraseña, MFA y sesiones personales permanecen en Mi cuenta."
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <StateMetric
          label="Controles administrativos"
          state={data.security.state}
        />
        <TextMetric
          label="Canal de recuperación"
          value={
            data.security.recoveryChannel === "CONFIGURED"
              ? "Configurado"
              : "No configurado"
          }
        />
        <TextMetric
          label="Política MFA"
          value={
            data.security.mfaRequired ? "Obligatoria" : "Activación escalonada"
          }
        />
      </div>
    </SectionSurface>
  );
}

function Diagnostics({ data }: { data: AdminSystemStatus }) {
  const rows: Array<[string, TechnicalComponentStatus]> = [
    ["API", data.api],
    ["PostgreSQL", data.services.postgres],
    ["Redis", data.services.redis],
    ["Master / Firebird", data.integrations.master],
    ["Bold", data.integrations.bold],
    ["SMTP", data.integrations.smtp],
  ];
  return (
    <SectionSurface
      id="diagnostics-heading"
      title="Diagnóstico"
      description="Lecturas sanitizadas para operadores con settings.manage; no expone secretos ni endpoints internos."
    >
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border-soft text-xs uppercase tracking-wide text-text-muted">
              <th className="px-3 py-3">Componente</th>
              <th className="px-3 py-3">Estado</th>
              <th className="px-3 py-3">Criticidad</th>
              <th className="px-3 py-3">Latencia</th>
              <th className="px-3 py-3">Última lectura</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([name, component]) => (
              <tr key={name} className="border-b border-border-soft/70">
                <th className="px-3 py-4 font-semibold text-text-main">
                  {name}
                </th>
                <td className="px-3 py-4">
                  <HealthBadge state={component.state} />
                </td>
                <td className="px-3 py-4">
                  {criticalityLabel(component.criticality)}
                </td>
                <td className="px-3 py-4">
                  {formatLatency(component.latencyMs)}
                </td>
                <td className="px-3 py-4">
                  {formatTimestamp(component.lastCheckedAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionSurface>
  );
}

function SectionSurface({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="data-surface p-5 sm:p-6">
      <h2 id={id} className="font-display text-lg font-semibold text-text-main">
        {title}
      </h2>
      <p className="mt-1 mb-5 text-sm text-text-muted">{description}</p>
      {children}
    </section>
  );
}
function ComponentCard({
  title,
  component,
  icon,
}: {
  title: string;
  component: TechnicalComponentStatus;
  icon: React.ReactNode;
}) {
  return (
    <article
      className={cn(
        "rounded-2xl border bg-white p-5 shadow-e1",
        component.state === "HEALTHY"
          ? "border-border-soft"
          : "border-warning/30",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <span
          aria-hidden="true"
          className="text-brand-dark [&>svg]:h-5 [&>svg]:w-5"
        >
          {icon}
        </span>
        <HealthBadge state={component.state} />
      </div>
      <h3 className="mt-4 font-semibold text-text-main">{title}</h3>
      <p className="mt-1 text-sm text-text-muted">
        {component.operationalImpact}
      </p>
      <p className="mt-3 text-xs text-text-muted">
        {criticalityLabel(component.criticality)} ·{" "}
        {formatLatency(component.latencyMs)}
      </p>
    </article>
  );
}
function HealthBadge({ state }: { state: HealthState }) {
  const view = STATE_PRESENTATION[state];
  return <StatusBadge tone={view.tone} label={view.label} />;
}
function StateMetric({
  label,
  state,
  detail,
}: {
  label: string;
  state: HealthState;
  detail?: string;
}) {
  return (
    <div className="rounded-xl border border-border-soft bg-bg-soft/40 p-4">
      <p className="text-sm text-text-muted">{label}</p>
      <div className="mt-2">
        <HealthBadge state={state} />
      </div>
      {detail && <p className="mt-2 text-xs text-text-muted">{detail}</p>}
    </div>
  );
}
function CountMetric({
  label,
  value,
  attention = false,
}: {
  label: string;
  value: number | null;
  attention?: boolean;
}) {
  const needsAttention = attention && value != null && value > 0;
  return (
    <div
      className={cn(
        "rounded-xl border p-4",
        needsAttention
          ? "border-warning/30 bg-warning/5"
          : "border-border-soft bg-bg-soft/40",
      )}
    >
      <dt className="text-sm text-text-muted">{label}</dt>
      <dd className="mt-2 flex items-center gap-2 font-display text-2xl font-semibold tabular-nums text-text-main">
        {needsAttention && (
          <AlertTriangle aria-hidden="true" className="h-4 w-4 text-warning" />
        )}
        {value == null ? (
          <span className="text-warning">Desconocido</span>
        ) : (
          value.toLocaleString("es-CO")
        )}
      </dd>
    </div>
  );
}
function TextMetric({ label, value }: { label: string; value: string }) {
  const unknown = !value || value === "UNKNOWN";
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-text-muted">
        {label}
      </dt>
      <dd
        className={cn(
          "mt-1 break-all text-sm font-medium",
          unknown ? "text-warning" : "text-text-main",
        )}
      >
        {unknown ? "Desconocido" : value}
      </dd>
    </div>
  );
}
function SystemSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true">
      <span role="status" className="sr-only">
        Cargando estado del sistema…
      </span>
      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-40 w-full" />
        ))}
      </div>
    </div>
  );
}
function criticalityLabel(
  value: TechnicalComponentStatus["criticality"],
): string {
  return value === "CORE"
    ? "Esencial"
    : value === "IMPORTANT"
      ? "Importante"
      : "Opcional";
}
function formatLatency(value: number | null): string {
  return value != null && Number.isFinite(value) && value >= 0
    ? `${value.toLocaleString("es-CO")} ms`
    : "Latencia desconocida";
}
function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "UNKNOWN";
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  return days > 0
    ? `${days} d ${hours} h`
    : hours > 0
      ? `${hours} h ${minutes} min`
      : `${minutes} min`;
}
function formatTimestamp(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "UNKNOWN"
    : new Intl.DateTimeFormat("es-CO", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}
