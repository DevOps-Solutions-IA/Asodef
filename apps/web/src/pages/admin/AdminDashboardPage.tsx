import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  BarChart3,
  BriefcaseBusiness,
  CreditCard,
  Gauge,
  UsersRound,
} from "lucide-react";
import { cn, ErrorState, PageHeader, Skeleton } from "@asodef/ui";
import { getAdminDashboard } from "../../lib/admin/admin-dashboard-api";
import { getAdminErrorMessage } from "../../lib/admin/admin-error-messages";
import { queryKeys } from "../../lib/query-keys";
import {
  PIPELINE_STAGE_LABELS,
  type PipelineStage,
} from "../../lib/admin/admin-crm-types";

interface MetricCardProps {
  label: string;
  value: number | string;
  tone?: "neutral" | "attention";
  icon?: React.ReactNode;
}

function MetricCard({ label, value, tone = "neutral", icon }: MetricCardProps) {
  return (
    <div
      className={cn(
        "premium-card-glow relative min-h-28 overflow-hidden rounded-2xl border bg-white p-4 shadow-e1",
        tone === "attention" ? "border-warning/30" : "border-border-soft",
      )}
    >
      {tone === "attention" && (
        <span
          aria-hidden="true"
          className="absolute inset-y-0 left-0 w-[3px] bg-warning"
        />
      )}
      <div className="flex items-start justify-between gap-2 pl-1.5">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-text-muted">
          {label}
        </p>
        {tone === "attention" && (
          <AlertTriangle
            aria-hidden="true"
            className="mt-0.5 h-4 w-4 shrink-0 text-warning"
          />
        )}
      </div>
      <p className="mt-3 pl-1.5 font-display text-3xl font-semibold tabular-nums tracking-tight text-text-main">
        {typeof value === "number" ? value.toLocaleString("es-CO") : value}
      </p>
      {icon && (
        <span
          aria-hidden="true"
          className="absolute bottom-3 right-3 text-brand-dark/10"
        >
          {icon}
        </span>
      )}
    </div>
  );
}

function MetricSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="font-display text-lg font-semibold text-text-main">
        {title}
      </h2>
      {children}
    </section>
  );
}

function formatMoney(cents: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function formatPercent(ratio: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(ratio);
}

/** Business and administrative operations only. Platform health, versions,
 * queues and personal security live in Sistema and Mi cuenta. */
export function AdminDashboardPage() {
  const query = useQuery({
    queryKey: queryKeys.admin.dashboard(),
    queryFn: ({ signal }) => getAdminDashboard(signal),
  });

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Gestión empresarial"
        icon={<Gauge className="h-5 w-5" />}
        title="Dashboard administrativo"
        description="Resumen de la operación de ASODEF y de los asuntos que requieren atención."
      />
      {query.isLoading && (
        <div
          className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4"
          aria-busy="true"
        >
          <span className="sr-only" role="status">
            Cargando métricas…
          </span>
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton key={index} className="h-28 w-full" />
          ))}
        </div>
      )}
      {query.isError && (
        <ErrorState description={getAdminErrorMessage(query.error)} />
      )}

      {query.isSuccess && (
        <>
          <MetricSection
            id="executive-summary-heading"
            title="Resumen ejecutivo"
          >
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              <MetricCard
                label="Nuevos prospectos (30d)"
                value={query.data.newProspects30d}
                icon={<UsersRound className="h-9 w-9" />}
              />
              <MetricCard
                label="Oportunidades abiertas"
                value={query.data.openOpportunities}
              />
              <MetricCard
                label="Empresas activas"
                value={query.data.activeCompanies}
              />
              <MetricCard
                label="Contratos activos"
                value={query.data.activeContracts}
                icon={<BriefcaseBusiness className="h-9 w-9" />}
              />
              <MetricCard
                label="Pagos pendientes"
                value={query.data.pagosPendientes}
              />
              <MetricCard
                label="Conciliaciones pendientes"
                value={query.data.reconciliationDifferencesOpen}
              />
              <MetricCard
                label="PQR abiertas"
                value={query.data.openPqrCases}
              />
              <MetricCard
                label="Solicitudes de datos"
                value={query.data.openDataSubjectRequests}
              />
              <MetricCard
                label="Aprobaciones pendientes"
                value={query.data.pendingApprovalGates}
              />
            </div>
          </MetricSection>

          <MetricSection id="attention-heading" title="Requiere atención">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              <MetricCard
                label="Leads sin seguimiento"
                value={query.data.leadsWithoutFollowUp}
                tone={
                  query.data.leadsWithoutFollowUp > 0 ? "attention" : "neutral"
                }
              />
              <MetricCard
                label="Contratos próximos a vencer"
                value={query.data.contractsNearingExpiration}
                tone={
                  query.data.contractsNearingExpiration > 0
                    ? "attention"
                    : "neutral"
                }
              />
              <MetricCard
                label="PQR vencidas por SLA"
                value={query.data.overduePqrCases}
                tone={query.data.overduePqrCases > 0 ? "attention" : "neutral"}
              />
              <MetricCard
                label="Solicitudes de datos vencidas"
                value={query.data.overdueDataSubjectRequests}
                tone={
                  query.data.overdueDataSubjectRequests > 0
                    ? "attention"
                    : "neutral"
                }
              />
              <MetricCard
                label="Pagos sin conciliar"
                value={query.data.reconciliationDifferencesOpen}
                tone={
                  query.data.reconciliationDifferencesOpen > 0
                    ? "attention"
                    : "neutral"
                }
              />
            </div>
          </MetricSection>

          <MetricSection id="commercial-heading" title="Comercial">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              <MetricCard
                label="Oportunidades ganadas"
                value={query.data.opportunitiesWon}
              />
              <MetricCard
                label="Oportunidades perdidas"
                value={query.data.opportunitiesLost}
              />
              <MetricCard
                label="Tasa de conversión"
                value={formatPercent(query.data.conversionRate)}
              />
              <MetricCard
                label="Convenios firmados"
                value={query.data.activeAgreements}
              />
              <MetricCard
                label="Actividad comercial (30d)"
                value={query.data.commercialActivities30d}
              />
            </div>
            {Object.keys(query.data.opportunitiesByStage).length > 0 && (
              <div className="data-surface p-5">
                <p className="mb-4 flex items-center gap-2 text-sm font-semibold text-text-main">
                  <BarChart3
                    aria-hidden="true"
                    className="h-4 w-4 text-brand-orange"
                  />{" "}
                  Oportunidades por etapa
                </p>
                <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {Object.entries(query.data.opportunitiesByStage).map(
                    ([stage, count]) => (
                      <div
                        key={stage}
                        className="flex justify-between gap-2 text-sm"
                      >
                        <dt className="text-text-muted">
                          {PIPELINE_STAGE_LABELS[stage as PipelineStage] ??
                            stage}
                        </dt>
                        <dd className="font-medium tabular-nums text-text-main">
                          {count}
                        </dd>
                      </div>
                    ),
                  )}
                </dl>
              </div>
            )}
          </MetricSection>

          <MetricSection id="contracts-heading" title="Contratos">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              <MetricCard label="Activos" value={query.data.activeContracts} />
              <MetricCard
                label="Pendientes de firma"
                value={query.data.contractsPendingSignature}
              />
              <MetricCard
                label="Próximos a vencer (30d)"
                value={query.data.contractsNearingExpiration}
                tone={
                  query.data.contractsNearingExpiration > 0
                    ? "attention"
                    : "neutral"
                }
              />
              <MetricCard
                label="Vencidos"
                value={query.data.expiredContracts}
                tone={query.data.expiredContracts > 0 ? "attention" : "neutral"}
              />
            </div>
          </MetricSection>

          <MetricSection id="financial-heading" title="Financiero">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              <MetricCard
                label="Recaudo diario"
                value={formatMoney(query.data.recaudoDiarioCents)}
                icon={<CreditCard className="h-9 w-9" />}
              />
              <MetricCard
                label="Recaudo mensual"
                value={formatMoney(query.data.recaudoMensualCents)}
              />
              <MetricCard
                label="Pagos aprobados"
                value={query.data.pagosAprobados}
              />
              <MetricCard
                label="Pagos pendientes"
                value={query.data.pagosPendientes}
                tone={query.data.pagosPendientes > 0 ? "attention" : "neutral"}
              />
              <MetricCard
                label="Pagos rechazados"
                value={query.data.pagosRechazados}
              />
              <MetricCard
                label="Tasa de aprobación"
                value={formatPercent(query.data.tasaAprobacion)}
              />
              <MetricCard
                label="Obligaciones pendientes"
                value={query.data.obligacionesPendientes}
              />
              <MetricCard
                label="Obligaciones vencidas"
                value={query.data.obligacionesVencidas}
                tone={
                  query.data.obligacionesVencidas > 0 ? "attention" : "neutral"
                }
              />
            </div>
          </MetricSection>

          <MetricSection
            id="administrative-heading"
            title="Gestión administrativa"
          >
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              <MetricCard
                label="PQR abiertas"
                value={query.data.openPqrCases}
              />
              <MetricCard
                label="Solicitudes de datos pendientes"
                value={query.data.openDataSubjectRequests}
              />
              <MetricCard
                label="Aprobaciones pendientes"
                value={query.data.pendingApprovalGates}
              />
            </div>
          </MetricSection>
        </>
      )}
    </div>
  );
}
