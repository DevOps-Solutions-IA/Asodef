import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Button, Dialog, EmptyState, ErrorState, FormField, Input, PageHeader, Select, Skeleton, Textarea } from "@asodef/ui";
import { listReconciliationDifferences, listReconciliationRuns, resolveReconciliationDifference, runReconciliation } from "../../../lib/admin/admin-reconciliation-api";
import { getAdminErrorMessage } from "../../../lib/admin/admin-error-messages";
import { queryKeys } from "../../../lib/query-keys";
import { useAuth } from "../../../lib/auth/auth-context";
import { RECONCILIATION_DIFFERENCE_KIND_LABELS } from "../../../lib/admin/admin-reconciliation-types";

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("es-CO", { year: "numeric", month: "short", day: "numeric" });
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" });
}

/** US-063 AC2: lists ReconciliationDifference records (per selected run,
 * with kind/resolutionStatus filters) with a resolution workflow (notes,
 * resolved-by, resolved-at). */
export function AdminReconciliationPage() {
  const { hasPermission } = useAuth();
  const canReconcile = hasPermission("payments.reconcile");
  const queryClient = useQueryClient();

  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [runDialogOpen, setRunDialogOpen] = useState(false);
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [resolveTargetId, setResolveTargetId] = useState<string | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState("");

  const runsQuery = useQuery({ queryKey: queryKeys.admin.reconciliation.runs(), queryFn: ({ signal }) => listReconciliationRuns(signal) });
  const differencesQuery = useQuery({
    queryKey: queryKeys.admin.reconciliation.differences(selectedRunId!),
    queryFn: ({ signal }) => listReconciliationDifferences(selectedRunId!, signal),
    enabled: !!selectedRunId,
  });

  const runMutation = useMutation({
    mutationFn: () => runReconciliation({ rangeStart, rangeEnd }),
    onSuccess: (run) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.reconciliation.runs() });
      setRunDialogOpen(false);
      setRangeStart("");
      setRangeEnd("");
      setSelectedRunId(run.id);
    },
  });

  const resolveMutation = useMutation({
    mutationFn: () => resolveReconciliationDifference(resolveTargetId!, resolutionNotes),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.reconciliation.differences(selectedRunId!) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.reconciliation.runs() });
      setResolveTargetId(null);
      setResolutionNotes("");
    },
  });

  const filteredDifferences = (differencesQuery.data ?? []).filter((difference) => {
    if (kindFilter && difference.kind !== kindFilter) return false;
    if (statusFilter && difference.resolutionStatus !== statusFilter) return false;
    return true;
  });

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Conciliación"
        description="Ejecuciones de conciliación y resolución de diferencias."
        actions={
          <Button
            type="button"
            disabled={!canReconcile}
            title={!canReconcile ? "No tienes permiso para ejecutar conciliación." : undefined}
            onClick={() => setRunDialogOpen(true)}
          >
            Ejecutar conciliación
          </Button>
        }
      />

      <section aria-labelledby="runs-heading" className="flex flex-col gap-3">
        <h2 id="runs-heading" className="font-display text-lg font-semibold text-text-main">
          Ejecuciones
        </h2>

        {runsQuery.isLoading && <Skeleton className="h-32 w-full" />}
        {runsQuery.isError && <ErrorState description={getAdminErrorMessage(runsQuery.error)} action={<Button onClick={() => runsQuery.refetch()}>Reintentar</Button>} />}
        {runsQuery.isSuccess && runsQuery.data.length === 0 && <EmptyState title="Sin ejecuciones" description="Aún no se ha ejecutado ninguna conciliación." />}

        {runsQuery.isSuccess && runsQuery.data.length > 0 && (
          <ul className="flex flex-col gap-2">
            {runsQuery.data.map((run) => (
              <li key={run.id}>
                <button
                  type="button"
                  onClick={() => setSelectedRunId(run.id)}
                  className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left text-sm transition-colors ${
                    selectedRunId === run.id ? "border-brand-dark bg-brand-dark/5" : "border-border-soft hover:bg-bg-soft"
                  }`}
                >
                  <span>
                    {formatDate(run.rangeStart)} — {formatDate(run.rangeEnd)} · {run.differencesFound} diferencia(s)
                  </span>
                  <Badge variant={run.resolutionStatus === "RESOLVED" ? "success" : "neutral"}>{run.resolutionStatus}</Badge>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {selectedRunId && (
        <section aria-labelledby="differences-heading" className="flex flex-col gap-3">
          <h2 id="differences-heading" className="font-display text-lg font-semibold text-text-main">
            Diferencias
          </h2>

          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="difference-kind-filter" className="mb-1.5 block text-sm font-medium text-text-main">
                Tipo
              </label>
              <Select id="difference-kind-filter" value={kindFilter} onChange={(event) => setKindFilter(event.target.value)}>
                <option value="">Todos</option>
                {Object.entries(RECONCILIATION_DIFFERENCE_KIND_LABELS).map(([kind, label]) => (
                  <option key={kind} value={kind}>
                    {label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label htmlFor="difference-status-filter" className="mb-1.5 block text-sm font-medium text-text-main">
                Estado
              </label>
              <Select id="difference-status-filter" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="">Todos</option>
                <option value="OPEN">Abierta</option>
                <option value="RESOLVED">Resuelta</option>
              </Select>
            </div>
          </div>

          {differencesQuery.isLoading && <Skeleton className="h-32 w-full" />}
          {differencesQuery.isError && <ErrorState description={getAdminErrorMessage(differencesQuery.error)} />}
          {differencesQuery.isSuccess && filteredDifferences.length === 0 && <EmptyState title="Sin diferencias" description="No hay diferencias que coincidan con los filtros." />}

          {differencesQuery.isSuccess && filteredDifferences.length > 0 && (
            <ul className="flex flex-col gap-2">
              {filteredDifferences.map((difference) => (
                <li key={difference.id} className="rounded-xl border border-border-soft p-4 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium text-text-main">{RECONCILIATION_DIFFERENCE_KIND_LABELS[difference.kind] ?? difference.kind}</p>
                    <Badge variant={difference.resolutionStatus === "RESOLVED" ? "success" : "warning"}>{difference.resolutionStatus}</Badge>
                  </div>
                  <p className="mt-1 text-text-muted">{formatDateTime(difference.createdAt)}</p>
                  {difference.resolutionStatus === "RESOLVED" ? (
                    <p className="mt-2 text-text-muted">
                      Resuelto {difference.resolvedAt ? formatDateTime(difference.resolvedAt) : ""}: {difference.resolutionNotes}
                    </p>
                  ) : (
                    <div className="mt-3">
                      <Button
                        type="button"
                        size="sm"
                        disabled={!canReconcile}
                        title={!canReconcile ? "No tienes permiso para resolver diferencias de conciliación." : undefined}
                        onClick={() => setResolveTargetId(difference.id)}
                      >
                        Resolver
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <Dialog open={runDialogOpen} onClose={() => setRunDialogOpen(false)} title="Ejecutar conciliación" description="Selecciona el rango de fechas a conciliar.">
        <div className="flex flex-col gap-4">
          <FormField label="Fecha inicial" required>
            {(controlProps) => <Input {...controlProps} type="date" value={rangeStart} onChange={(event) => setRangeStart(event.target.value)} />}
          </FormField>
          <FormField label="Fecha final" required>
            {(controlProps) => <Input {...controlProps} type="date" value={rangeEnd} onChange={(event) => setRangeEnd(event.target.value)} />}
          </FormField>
          {runMutation.isError && <ErrorState description={getAdminErrorMessage(runMutation.error)} />}
          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => setRunDialogOpen(false)} disabled={runMutation.isPending}>
              Cancelar
            </Button>
            <Button type="button" loading={runMutation.isPending} disabled={!rangeStart || !rangeEnd} onClick={() => runMutation.mutate()}>
              Ejecutar
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog open={!!resolveTargetId} onClose={() => setResolveTargetId(null)} title="Resolver diferencia" description="Las notas de resolución son requeridas.">
        <div className="flex flex-col gap-4">
          <div>
            <label htmlFor="resolution-notes" className="mb-1.5 block text-sm font-medium text-text-main">
              Notas de resolución
            </label>
            <Textarea id="resolution-notes" required rows={3} value={resolutionNotes} onChange={(event) => setResolutionNotes(event.target.value)} />
          </div>
          {resolveMutation.isError && <ErrorState description={getAdminErrorMessage(resolveMutation.error)} />}
          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => setResolveTargetId(null)} disabled={resolveMutation.isPending}>
              Cancelar
            </Button>
            <Button type="button" loading={resolveMutation.isPending} disabled={!resolutionNotes.trim()} onClick={() => resolveMutation.mutate()}>
              Confirmar
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
