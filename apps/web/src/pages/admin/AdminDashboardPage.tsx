import { useQuery } from "@tanstack/react-query";
import { Card, ErrorState, PageHeader, Skeleton } from "@asodef/ui";
import { getUserStats } from "../../lib/admin/admin-users-api";
import { getAdminDashboard } from "../../lib/admin/admin-dashboard-api";
import { getAdminErrorMessage } from "../../lib/admin/admin-error-messages";
import { queryKeys } from "../../lib/query-keys";
import { useAuth } from "../../lib/auth/auth-context";
import { PIPELINE_STAGE_LABELS, type PipelineStage } from "../../lib/admin/admin-crm-types";

interface MetricCardProps {
  label: string;
  value: number;
}

function MetricCard({ label, value }: MetricCardProps) {
  return (
    <Card className="p-5">
      <p className="text-sm text-text-muted">{label}</p>
      <p className="mt-1 font-display text-3xl font-semibold text-text-main">{value.toLocaleString("es-CO")}</p>
    </Card>
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
              <Card className="p-5">
                <p className="text-sm text-text-muted">Tasa de conversión</p>
                <p className="mt-1 font-display text-3xl font-semibold text-text-main">{formatPercent(dashboardQuery.data.conversionRate)}</p>
              </Card>
              <MetricCard label="Empresas activas" value={dashboardQuery.data.activeCompanies} />
              <MetricCard label="Convenios firmados" value={dashboardQuery.data.activeAgreements} />
              <MetricCard label="Actividad comercial (30d)" value={dashboardQuery.data.commercialActivities30d} />
              <MetricCard label="Leads sin seguimiento" value={dashboardQuery.data.leadsWithoutFollowUp} />
            </div>

            {Object.keys(dashboardQuery.data.opportunitiesByStage).length > 0 && (
              <div className="rounded-2xl border border-border-soft p-5">
                <p className="mb-3 text-sm font-medium text-text-main">Oportunidades por etapa</p>
                <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {Object.entries(dashboardQuery.data.opportunitiesByStage).map(([stage, count]) => (
                    <div key={stage} className="flex justify-between gap-2 text-sm">
                      <dt className="text-text-muted">{PIPELINE_STAGE_LABELS[stage as PipelineStage] ?? stage}</dt>
                      <dd className="font-medium text-text-main">{count}</dd>
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
              <MetricCard label="Próximos a vencer (30d)" value={dashboardQuery.data.contractsNearingExpiration} />
            </div>
          </section>

          <section aria-labelledby="payments-metrics-heading" className="flex flex-col gap-3">
            <h2 id="payments-metrics-heading" className="font-display text-lg font-semibold text-text-main">
              Pagos
            </h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              <Card className="p-5">
                <p className="text-sm text-text-muted">Recaudo diario</p>
                <p className="mt-1 font-display text-3xl font-semibold text-text-main">{formatMoney(dashboardQuery.data.recaudoDiarioCents)}</p>
              </Card>
              <Card className="p-5">
                <p className="text-sm text-text-muted">Recaudo mensual</p>
                <p className="mt-1 font-display text-3xl font-semibold text-text-main">{formatMoney(dashboardQuery.data.recaudoMensualCents)}</p>
              </Card>
              <MetricCard label="Pagos aprobados" value={dashboardQuery.data.pagosAprobados} />
              <MetricCard label="Pagos pendientes" value={dashboardQuery.data.pagosPendientes} />
              <MetricCard label="Pagos rechazados" value={dashboardQuery.data.pagosRechazados} />
              <Card className="p-5">
                <p className="text-sm text-text-muted">Tasa de aprobación</p>
                <p className="mt-1 font-display text-3xl font-semibold text-text-main">{formatPercent(dashboardQuery.data.tasaAprobacion)}</p>
              </Card>
              <MetricCard label="Obligaciones pendientes" value={dashboardQuery.data.obligacionesPendientes} />
              <MetricCard label="Obligaciones vencidas" value={dashboardQuery.data.obligacionesVencidas} />
              <MetricCard label="Diferencias de conciliación abiertas" value={dashboardQuery.data.reconciliationDifferencesOpen} />
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
              <MetricCard label="Cuentas bloqueadas" value={userStatsQuery.data.lockedUsers} />
              <MetricCard label="Fallos de inicio de sesión (24h)" value={userStatsQuery.data.recentLoginFailures24h} />
              <MetricCard label="Sesiones activas" value={userStatsQuery.data.activeSessions} />
            </div>
          )}
        </section>
      )}
    </div>
  );
}
