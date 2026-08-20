import { useQuery } from "@tanstack/react-query";
import { Activity, AlertTriangle, BarChart3, BriefcaseBusiness, CreditCard, Database, Gauge, Server, ShieldCheck, UsersRound } from "lucide-react";
import { cn, ErrorState, PageHeader, Skeleton, StatusBadge, type StatusTone } from "@asodef/ui";
import { getUserDetail, getUserStats, listUserSessions } from "../../lib/admin/admin-users-api";
import { getAdminDashboard } from "../../lib/admin/admin-dashboard-api";
import { getAdminSystemStatus } from "../../lib/admin/admin-system-api";
import type { AdminSystemStatus, OperationalStatus } from "../../lib/admin/admin-system-types";
import { getAdminErrorMessage } from "../../lib/admin/admin-error-messages";
import { queryKeys } from "../../lib/query-keys";
import { useAuth } from "../../lib/auth/auth-context";
import { getMfaStatus } from "../../lib/auth/auth-api";
import { PIPELINE_STAGE_LABELS, type PipelineStage } from "../../lib/admin/admin-crm-types";

interface MetricCardProps {
  label: string;
  value: number | string;
  /** "attention" marks a figure that represents risk/backlog (an
   * overdue obligation, a stalled lead, an open reconciliation gap) -
   * a warning-tinted accent bar and icon so it reads as needing a look
   * at a glance, not just another neutral count in the same grid. */
  tone?: "neutral" | "attention";
  icon?: React.ReactNode;
}

/** Dense stat-tile treatment, deliberately distinct from the
 * translucent, backdrop-blur Card used on spacious marketing/auth
 * surfaces - a tight grid of 20+ tiles reads better as compact, crisp
 * surfaces than as many small "glass" panels stacked together. */
function MetricCard({ label, value, tone = "neutral", icon }: MetricCardProps) {
  return (
    <div
      className={cn(
        "premium-card-glow relative min-h-28 overflow-hidden rounded-2xl border bg-white p-4 shadow-e1 transition-all duration-enterprise ease-enterprise hover:-translate-y-0.5 hover:shadow-e3 motion-reduce:transform-none",
        tone === "attention" ? "border-warning/30" : "border-border-soft",
      )}
    >
      {tone === "attention" && <span aria-hidden="true" className="absolute inset-y-0 left-0 w-[3px] bg-warning" />}
      <div className="flex items-start justify-between gap-2 pl-1.5">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-text-muted">{label}</p>
        {tone === "attention" && <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-warning" />}
      </div>
      <p className="mt-3 pl-1.5 font-display text-3xl font-semibold tabular-nums tracking-tight text-text-main">
        {typeof value === "number" ? value.toLocaleString("es-CO") : value}
      </p>
      {icon && <span aria-hidden="true" className="absolute bottom-3 right-3 text-brand-dark/10">{icon}</span>}
    </div>
  );
}

function formatMoney(cents: number): string {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(cents / 100);
}

function formatPercent(ratio: number): string {
  return new Intl.NumberFormat("es-CO", { style: "percent", maximumFractionDigits: 1 }).format(ratio);
}

const STATUS_PRESENTATION: Record<OperationalStatus, { label: string; tone: StatusTone }> = {
  AVAILABLE: { label: "Disponible", tone: "success" },
  UNAVAILABLE: { label: "No disponible", tone: "failed" },
  NOT_CONFIGURED: { label: "No configurado", tone: "inactive" },
  UNKNOWN: { label: "Desconocido", tone: "draft" },
};

function OperationalBadge({ status }: { status: OperationalStatus }) {
  const presentation = STATUS_PRESENTATION[status];
  return <StatusBadge tone={presentation.tone} label={presentation.label} />;
}

function ControlMetric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border-soft bg-bg-soft/40 p-4">
      <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-text-muted">{label}</dt>
      <dd className="mt-2 break-words text-sm font-semibold text-text-main">{value}</dd>
    </div>
  );
}

function UnknownValue({ reason = "Sin una fuente disponible" }: { reason?: string }) {
  return <span className="text-warning" title={reason}>Desconocido</span>;
}

function formatTimestamp(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? null
    : new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function formatPasswordAge(value: string | null | undefined): string | null {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp) || timestamp > Date.now()) return null;
  const days = Math.floor((Date.now() - timestamp) / 86_400_000);
  return `${days.toLocaleString("es-CO")} ${days === 1 ? "día" : "días"}`;
}

function formatDuration(seconds: number): string | null {
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  return days > 0 ? `${days} d ${hours} h` : hours > 0 ? `${hours} h ${minutes} min` : `${minutes} min`;
}

function RuntimeStatus({ data }: { data: AdminSystemStatus | undefined }) {
  const unknown = <OperationalBadge status="UNKNOWN" />;
  return (
    <section aria-labelledby="system-core-heading" className="data-surface p-5 sm:p-6">
      <h2 id="system-core-heading" className="flex items-center gap-2 font-display text-lg font-semibold text-text-main">
        <Server aria-hidden="true" className="h-5 w-5 text-brand-dark" /> Sistema
      </h2>
      <p className="mt-1 text-sm text-text-muted">Salud observada de las dependencias; lo no verificable se conserva como desconocido.</p>
      <dl className="mt-5 grid grid-cols-2 gap-3">
        <ControlMetric label="API" value={data ? <OperationalBadge status={data.api.status} /> : unknown} />
        <ControlMetric label="PostgreSQL" value={data ? <OperationalBadge status={data.dependencies.postgres.status} /> : unknown} />
        <ControlMetric label="Redis" value={data ? <OperationalBadge status={data.dependencies.redis.status} /> : unknown} />
        <ControlMetric label="Master / Firebird" value={data ? <OperationalBadge status={data.dependencies.master.status} /> : unknown} />
      </dl>
    </section>
  );
}

/**
 * US-064 AC1: every figure comes from GET /admin/dashboard, a live DB
 * query bundle - nothing here is a constant. The pre-existing user-
 * account stats section (built under an earlier story) is now gated by
 * users.read: it queried unconditionally before, which threw an error
 * for every internal-staff role except ADMIN/SUPER_ADMIN landing on
 * their own default page - a real bug fixed here, not introduced.
 */
export function AdminDashboardPage() {
  const { user, hasPermission } = useAuth();
  const canReadUsers = hasPermission("users.read");
  const canReadSessions = hasPermission("users.sessions.read");
  const canReadSystem = hasPermission("settings.manage");
  const canReadMfa = user?.roles.includes("SUPER_ADMIN") ?? false;

  const dashboardQuery = useQuery({ queryKey: queryKeys.admin.dashboard(), queryFn: ({ signal }) => getAdminDashboard(signal) });
  const userStatsQuery = useQuery({
    queryKey: queryKeys.admin.users.stats(),
    queryFn: ({ signal }) => getUserStats(signal),
    enabled: canReadUsers,
  });
  const systemQuery = useQuery({
    queryKey: queryKeys.admin.system(),
    queryFn: ({ signal }) => getAdminSystemStatus(signal),
    enabled: canReadSystem,
  });
  const currentUserDetailQuery = useQuery({
    queryKey: queryKeys.admin.users.detail(user?.id ?? "current"),
    queryFn: ({ signal }) => getUserDetail(user!.id, signal),
    enabled: canReadUsers && Boolean(user),
  });
  const currentSessionsQuery = useQuery({
    queryKey: queryKeys.admin.users.sessions(user?.id ?? "current"),
    queryFn: ({ signal }) => listUserSessions(user!.id, signal),
    enabled: canReadSessions && Boolean(user),
  });
  const mfaStatusQuery = useQuery({
    queryKey: queryKeys.auth.mfaStatus(),
    queryFn: ({ signal }) => getMfaStatus(signal),
    enabled: canReadMfa,
  });

  const systemData = systemQuery.isSuccess ? systemQuery.data : undefined;
  const detail = currentUserDetailQuery.isSuccess ? currentUserDetailQuery.data : undefined;
  const sessions = currentSessionsQuery.isSuccess ? currentSessionsQuery.data : undefined;
  const activeSessionCount = sessions
    ? sessions.filter((session) => session.isActive).length
    : detail?.activeSessionCount;
  const revokedSessionCount = sessions?.filter((session) => session.revokedAt !== null).length;
  const securitySignals = userStatsQuery.isSuccess
    ? `${userStatsQuery.data.recentLoginFailures24h.toLocaleString("es-CO")} fallos · ${userStatsQuery.data.lockedUsers.toLocaleString("es-CO")} bloqueos`
    : undefined;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader eyebrow="Inteligencia operativa" icon={<Gauge className="h-5 w-5" />} title="Dashboard administrativo" description="Lectura consolidada de la actividad comercial, financiera y operativa en tiempo real." />

      <div className="grid gap-5 xl:grid-cols-3">
        <RuntimeStatus data={systemData} />

        <section aria-labelledby="security-core-heading" className="data-surface p-5 sm:p-6">
          <h2 id="security-core-heading" className="flex items-center gap-2 font-display text-lg font-semibold text-text-main">
            <ShieldCheck aria-hidden="true" className="h-5 w-5 text-brand-dark" /> Seguridad
          </h2>
          <p className="mt-1 text-sm text-text-muted">Estado real de la identidad y las sesiones que este actor está autorizado a consultar.</p>
          <dl className="mt-5 grid gap-3 sm:grid-cols-2">
            <ControlMetric label="Último acceso" value={formatTimestamp(detail?.lastLoginAt) ?? <UnknownValue reason="Requiere users.read" />} />
            <ControlMetric label="Fallos de acceso (24h)" value={userStatsQuery.isSuccess ? userStatsQuery.data.recentLoginFailures24h.toLocaleString("es-CO") : <UnknownValue reason="Requiere users.read" />} />
            <ControlMetric label="Sesiones activas" value={activeSessionCount != null ? activeSessionCount.toLocaleString("es-CO") : <UnknownValue reason="Requiere users.sessions.read o users.read" />} />
            <ControlMetric label="Sesiones revocadas" value={revokedSessionCount != null ? revokedSessionCount.toLocaleString("es-CO") : <UnknownValue reason="Requiere users.sessions.read" />} />
            <ControlMetric
              label="MFA"
              value={mfaStatusQuery.isSuccess
                ? (mfaStatusQuery.data.enrolled ? "Activo" : mfaStatusQuery.data.required ? "Inscripción requerida" : "No inscrito")
                : <UnknownValue reason="Disponible para SUPER_ADMIN" />}
            />
            <ControlMetric label="Antigüedad de contraseña" value={formatPasswordAge(detail?.passwordChangedAt) ?? <UnknownValue reason="Requiere users.read y una fecha registrada" />} />
          </dl>
        </section>

        <section aria-labelledby="operations-core-heading" className="data-surface p-5 sm:p-6">
          <h2 id="operations-core-heading" className="flex items-center gap-2 font-display text-lg font-semibold text-text-main">
            <Database aria-hidden="true" className="h-5 w-5 text-brand-dark" /> Operación
          </h2>
          <p className="mt-1 text-sm text-text-muted">Release, migración y señales operativas sin asumir telemetría inexistente.</p>
          <dl className="mt-5 grid gap-3 sm:grid-cols-2">
            <ControlMetric label="Release" value={systemData?.api.releaseSha && systemData.api.releaseSha !== "UNKNOWN" ? systemData.api.releaseSha : <UnknownValue reason="Requiere settings.manage o APP_RELEASE_SHA" />} />
            <ControlMetric label="Versión API" value={systemData?.api.version && systemData.api.version !== "UNKNOWN" ? systemData.api.version : <UnknownValue reason="Requiere settings.manage o APP_VERSION" />} />
            <ControlMetric label="Migración" value={systemData?.api.migrationVersion && systemData.api.migrationVersion !== "UNKNOWN" ? systemData.api.migrationVersion : <UnknownValue reason="Requiere settings.manage y PostgreSQL disponible" />} />
            <ControlMetric label="Uptime" value={systemData ? formatDuration(systemData.api.uptimeSeconds) ?? <UnknownValue /> : <UnknownValue reason="Requiere settings.manage" />} />
            <ControlMetric label="Backlog de notificaciones" value={systemData?.notifications.backlog != null ? systemData.notifications.backlog.toLocaleString("es-CO") : <UnknownValue reason="Requiere settings.manage y PostgreSQL disponible" />} />
            <ControlMetric label="Señales de seguridad (24h)" value={securitySignals ?? <UnknownValue reason="Requiere users.read" />} />
            <ControlMetric label="Tasa de errores" value={<span className="text-text-muted">No configurado</span>} />
          </dl>
        </section>
      </div>

      {dashboardQuery.isLoading && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4" aria-busy="true">
          <span className="sr-only" role="status">
            Cargando métricas…
          </span>
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton key={index} className="h-24 w-full" />
          ))}
        </div>
      )}

      {dashboardQuery.isError && <ErrorState description={getAdminErrorMessage(dashboardQuery.error)} />}

      {dashboardQuery.isSuccess && (
        <>
          <section aria-labelledby="crm-metrics-heading" className="flex flex-col gap-3">
            <h2 id="crm-metrics-heading" className="font-display text-lg font-semibold text-text-main">
              Comercial
            </h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              <MetricCard label="Nuevos prospectos (30d)" value={dashboardQuery.data.newProspects30d} icon={<UsersRound className="h-9 w-9" />} />
              <MetricCard label="Oportunidades ganadas" value={dashboardQuery.data.opportunitiesWon} />
              <MetricCard label="Oportunidades perdidas" value={dashboardQuery.data.opportunitiesLost} />
              <MetricCard label="Tasa de conversión" value={formatPercent(dashboardQuery.data.conversionRate)} />
              <MetricCard label="Empresas activas" value={dashboardQuery.data.activeCompanies} />
              <MetricCard label="Convenios firmados" value={dashboardQuery.data.activeAgreements} />
              <MetricCard label="Actividad comercial (30d)" value={dashboardQuery.data.commercialActivities30d} />
              <MetricCard label="Leads sin seguimiento" value={dashboardQuery.data.leadsWithoutFollowUp} tone={dashboardQuery.data.leadsWithoutFollowUp > 0 ? "attention" : "neutral"} />
            </div>

            {Object.keys(dashboardQuery.data.opportunitiesByStage).length > 0 && (
              <div className="data-surface p-5">
                <p className="mb-4 flex items-center gap-2 text-sm font-semibold text-text-main"><BarChart3 aria-hidden="true" className="h-4 w-4 text-brand-orange" /> Oportunidades por etapa</p>
                <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {Object.entries(dashboardQuery.data.opportunitiesByStage).map(([stage, count]) => (
                    <div key={stage} className="flex justify-between gap-2 text-sm">
                      <dt className="text-text-muted">{PIPELINE_STAGE_LABELS[stage as PipelineStage] ?? stage}</dt>
                      <dd className="font-medium tabular-nums text-text-main">{count}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
          </section>

          <section aria-labelledby="contracts-metrics-heading" className="flex flex-col gap-3">
            <h2 id="contracts-metrics-heading" className="font-display text-lg font-semibold text-text-main">
              Contratos
            </h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              <MetricCard label="Pendientes de firma" value={dashboardQuery.data.contractsPendingSignature} icon={<BriefcaseBusiness className="h-9 w-9" />} />
              <MetricCard
                label="Próximos a vencer (30d)"
                value={dashboardQuery.data.contractsNearingExpiration}
                tone={dashboardQuery.data.contractsNearingExpiration > 0 ? "attention" : "neutral"}
              />
            </div>
          </section>

          <section aria-labelledby="payments-metrics-heading" className="flex flex-col gap-3">
            <h2 id="payments-metrics-heading" className="font-display text-lg font-semibold text-text-main">
              Pagos
            </h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              <MetricCard label="Recaudo diario" value={formatMoney(dashboardQuery.data.recaudoDiarioCents)} icon={<CreditCard className="h-9 w-9" />} />
              <MetricCard label="Recaudo mensual" value={formatMoney(dashboardQuery.data.recaudoMensualCents)} />
              <MetricCard label="Pagos aprobados" value={dashboardQuery.data.pagosAprobados} />
              <MetricCard label="Pagos pendientes" value={dashboardQuery.data.pagosPendientes} />
              <MetricCard label="Pagos rechazados" value={dashboardQuery.data.pagosRechazados} />
              <MetricCard label="Tasa de aprobación" value={formatPercent(dashboardQuery.data.tasaAprobacion)} />
              <MetricCard label="Obligaciones pendientes" value={dashboardQuery.data.obligacionesPendientes} />
              <MetricCard
                label="Obligaciones vencidas"
                value={dashboardQuery.data.obligacionesVencidas}
                tone={dashboardQuery.data.obligacionesVencidas > 0 ? "attention" : "neutral"}
              />
              <MetricCard
                label="Diferencias de conciliación abiertas"
                value={dashboardQuery.data.reconciliationDifferencesOpen}
                tone={dashboardQuery.data.reconciliationDifferencesOpen > 0 ? "attention" : "neutral"}
              />
            </div>
          </section>
        </>
      )}

      {canReadUsers && (
        <section aria-labelledby="users-metrics-heading" className="flex flex-col gap-3">
          <h2 id="users-metrics-heading" className="font-display text-lg font-semibold text-text-main">
            Cuentas de usuario
          </h2>

          {userStatsQuery.isLoading && (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4" aria-busy="true">
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} className="h-24 w-full" />
              ))}
            </div>
          )}
          {userStatsQuery.isError && <ErrorState description={getAdminErrorMessage(userStatsQuery.error)} />}
          {userStatsQuery.isSuccess && (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              <MetricCard label="Usuarios totales" value={userStatsQuery.data.totalUsers} icon={<Activity className="h-9 w-9" />} />
              <MetricCard label="Usuarios activos" value={userStatsQuery.data.activeUsers} />
              <MetricCard label="Usuarios inactivos" value={userStatsQuery.data.inactiveUsers} />
              <MetricCard label="Usuarios suspendidos" value={userStatsQuery.data.suspendedUsers} />
              <MetricCard
                label="Cuentas bloqueadas"
                value={userStatsQuery.data.lockedUsers}
                tone={userStatsQuery.data.lockedUsers > 0 ? "attention" : "neutral"}
              />
              <MetricCard
                label="Fallos de inicio de sesión (24h)"
                value={userStatsQuery.data.recentLoginFailures24h}
                tone={userStatsQuery.data.recentLoginFailures24h > 0 ? "attention" : "neutral"}
              />
              <MetricCard label="Sesiones activas" value={userStatsQuery.data.activeSessions} />
            </div>
          )}
        </section>
      )}
    </div>
  );
}
