import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { cn, ErrorState, PageHeader, Skeleton } from "@asodef/ui";
import { getUserStats } from "../../lib/admin/admin-users-api";
import { getAdminDashboard } from "../../lib/admin/admin-dashboard-api";
import { getAdminErrorMessage } from "../../lib/admin/admin-error-messages";
import { queryKeys } from "../../lib/query-keys";
import { useAuth } from "../../lib/auth/auth-context";
import { PIPELINE_STAGE_LABELS, type PipelineStage } from "../../lib/admin/admin-crm-types";

interface MetricCardProps {
  label: string;
  value: number | string;
  /** "attention" marks a figure that represents risk/backlog (an
   * overdue obligation, a stalled lead, an open reconciliation gap) -
   * a warning-tinted accent bar and icon so it reads as needing a look
   * at a glance, not just another neutral count in the same grid. */
  tone?: "neutral" | "attention";
}

/** Dense stat-tile treatment, deliberately distinct from the
 * translucent, backdrop-blur Card used on spacious marketing/auth
 * surfaces - a tight grid of 20+ tiles reads better as compact, crisp
 * surfaces than as many small "glass" panels stacked together. */
function MetricCard({ label, value, tone = "neutral" }: MetricCardProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border bg-white p-4 shadow-e1 transition-shadow duration-150 hover:shadow-e2",
        tone === "attention" ? "border-warning/30" : "border-border-soft",
      )}
    >
      {tone === "attention" && <span aria-hidden="true" className="absolute inset-y-0 left-0 w-[3px] bg-warning" />}
      <div className="flex items-start justify-between gap-2 pl-1.5">
        <p className="text-sm text-text-muted">{label}</p>
        {tone === "attention" && <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-warning" />}
      </div>
      <p className="mt-1 pl-1.5 font-display text-3xl font-semibold tabular-nums text-text-main">
        {typeof value === "number" ? value.toLocaleString("es-CO") : value}
      </p>
    </div>
  );
}

function formatMoney(cents: number): string {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(cents / 100);
}

function formatPercent(ratio: number): string {
  return new Intl.NumberFormat("es-CO", { style: "percent", maximumFractionDigits: 1 }).format(ratio);
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
  const { hasPermission } = useAuth();
  const canReadUsers = hasPermission("users.read");

  const dashboardQuery = useQuery({ queryKey: queryKeys.admin.dashboard(), queryFn: ({ signal }) => getAdminDashboard(signal) });
  const userStatsQuery = useQuery({
    queryKey: queryKeys.admin.users.stats(),
    queryFn: ({ signal }) => getUserStats(signal),
    enabled: canReadUsers,
  });

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Dashboard administrativo" description="Métricas comerciales, financieras y operativas en tiempo real." />

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
              <MetricCard label="Nuevos prospectos (30d)" value={dashboardQuery.data.newProspects30d} />
              <MetricCard label="Oportunidades ganadas" value={dashboardQuery.data.opportunitiesWon} />
              <MetricCard label="Oportunidades perdidas" value={dashboardQuery.data.opportunitiesLost} />
              <MetricCard label="Tasa de conversión" value={formatPercent(dashboardQuery.data.conversionRate)} />
              <MetricCard label="Empresas activas" value={dashboardQuery.data.activeCompanies} />
              <MetricCard label="Convenios firmados" value={dashboardQuery.data.activeAgreements} />
              <MetricCard label="Actividad comercial (30d)" value={dashboardQuery.data.commercialActivities30d} />
              <MetricCard label="Leads sin seguimiento" value={dashboardQuery.data.leadsWithoutFollowUp} tone={dashboardQuery.data.leadsWithoutFollowUp > 0 ? "attention" : "neutral"} />
            </div>

            {Object.keys(dashboardQuery.data.opportunitiesByStage).length > 0 && (
              <div className="rounded-xl border border-border-soft bg-white p-5 shadow-e1">
                <p className="mb-3 text-sm font-medium text-text-main">Oportunidades por etapa</p>
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
              <MetricCard label="Pendientes de firma" value={dashboardQuery.data.contractsPendingSignature} />
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
              <MetricCard label="Recaudo diario" value={formatMoney(dashboardQuery.data.recaudoDiarioCents)} />
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
              <MetricCard label="Usuarios totales" value={userStatsQuery.data.totalUsers} />
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
