import { useQuery } from "@tanstack/react-query";
import { Card, ErrorState, PageHeader, Skeleton } from "@asodef/ui";
import { getUserStats } from "../../lib/admin/admin-users-api";
import { getAdminErrorMessage } from "../../lib/admin/admin-error-messages";
import { queryKeys } from "../../lib/query-keys";

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

export function AdminDashboardPage() {
  const query = useQuery({ queryKey: queryKeys.admin.users.stats(), queryFn: ({ signal }) => getUserStats(signal) });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Dashboard administrativo" description="Resumen del estado de las cuentas de usuario." />

      {query.isLoading && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4" aria-busy="true">
          <span className="sr-only" role="status">
            Cargando métricas…
          </span>
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-24 w-full" />
          ))}
        </div>
      )}

      {query.isError && (
        <ErrorState description={getAdminErrorMessage(query.error)} />
      )}

      {query.isSuccess && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          <MetricCard label="Usuarios totales" value={query.data.totalUsers} />
          <MetricCard label="Usuarios activos" value={query.data.activeUsers} />
          <MetricCard label="Usuarios inactivos" value={query.data.inactiveUsers} />
          <MetricCard label="Usuarios suspendidos" value={query.data.suspendedUsers} />
          <MetricCard label="Cuentas bloqueadas" value={query.data.lockedUsers} />
          <MetricCard label="Fallos de inicio de sesión (24h)" value={query.data.recentLoginFailures24h} />
          <MetricCard label="Sesiones activas" value={query.data.activeSessions} />
        </div>
      )}
    </div>
  );
}
