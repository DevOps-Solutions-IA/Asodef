import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Alert, Badge, Button, EmptyState, ErrorState, Input, PageHeader, Skeleton } from "@asodef/ui";
import { getExportJobDownloadUrl, getExportJobStatus, getReportCsvUrl, listReports, runReport } from "../../../lib/admin/admin-reports-api";
import { getAdminErrorMessage } from "../../../lib/admin/admin-error-messages";
import { queryKeys } from "../../../lib/query-keys";
import type { AdminExportJobStatus } from "../../../lib/admin/admin-reports-types";

/**
 * US-064 AC2: the report list from the AC's own literal enumeration,
 * with CSV export. Large exports (>1000 rows) return a 202 job instead
 * of inline results - this page polls the job until READY, then offers
 * a real download link, never a fake progress bar.
 */
export function AdminReportsPage() {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [status, setStatus] = useState("");
  const [runTrigger, setRunTrigger] = useState(0);
  const [activeJob, setActiveJob] = useState<AdminExportJobStatus | null>(null);

  const reportsQuery = useQuery({ queryKey: queryKeys.admin.reports.list(), queryFn: ({ signal }) => listReports(signal) });

  const filters = { dateFrom: dateFrom || undefined, dateTo: dateTo || undefined, status: status || undefined };
  const runQuery = useQuery({
    queryKey: queryKeys.admin.reports.run(selectedKey ?? "", { ...filters, runTrigger }),
    queryFn: ({ signal }) => runReport(selectedKey!, filters, signal),
    enabled: !!selectedKey && runTrigger > 0,
  });

  useEffect(() => {
    if (runQuery.isSuccess && "jobId" in runQuery.data) {
      setActiveJob({ id: runQuery.data.jobId, reportKey: selectedKey!, status: "PENDING", rowCount: runQuery.data.rowCount, errorMessage: null, createdAt: new Date().toISOString(), completedAt: null });
    }
  }, [runQuery.isSuccess, runQuery.data, selectedKey]);

  useEffect(() => {
    if (!activeJob || activeJob.status === "READY" || activeJob.status === "FAILED") return;
    const interval = setInterval(async () => {
      const status = await getExportJobStatus(activeJob.id);
      setActiveJob(status);
    }, 1500);
    return () => clearInterval(interval);
  }, [activeJob]);

  function handleSelectReport(key: string) {
    setSelectedKey(key);
    setRunTrigger(0);
    setActiveJob(null);
  }

  function handleRun() {
    setActiveJob(null);
    setRunTrigger((n) => n + 1);
  }

  const runResult = runQuery.data && !("jobId" in runQuery.data) ? runQuery.data : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Reportes" description="Reportes exportables calculados a partir de datos en vivo." />

      {reportsQuery.isLoading && <Skeleton className="h-32 w-full" />}
      {reportsQuery.isError && <ErrorState description={getAdminErrorMessage(reportsQuery.error)} action={<Button onClick={() => reportsQuery.refetch()}>Reintentar</Button>} />}

      {reportsQuery.isSuccess && (
        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          <nav aria-label="Tipos de reporte">
            <ul className="flex flex-col gap-1">
              {reportsQuery.data.map((report) => (
                <li key={report.key}>
                  <button
                    type="button"
                    onClick={() => handleSelectReport(report.key)}
                    className={`relative block w-full rounded-lg py-2 pl-4 pr-3 text-left text-sm transition-colors duration-150 ${
                      selectedKey === report.key
                        ? "bg-brand-dark-50 font-semibold text-brand-dark before:absolute before:inset-y-1.5 before:left-0 before:w-[3px] before:rounded-full before:bg-brand-orange"
                        : "text-text-main hover:bg-bg-soft"
                    }`}
                  >
                    {report.label}
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          <div>
            {!selectedKey && <EmptyState title="Selecciona un reporte" description="Elige un tipo de reporte de la lista para configurarlo y ejecutarlo." />}

            {selectedKey && (
              <div className="flex flex-col gap-4">
                <div className="flex flex-wrap items-end gap-3">
                  <div>
                    <label htmlFor="report-date-from" className="mb-1.5 block text-sm font-medium text-text-main">
                      Desde
                    </label>
                    <Input id="report-date-from" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
                  </div>
                  <div>
                    <label htmlFor="report-date-to" className="mb-1.5 block text-sm font-medium text-text-main">
                      Hasta
                    </label>
                    <Input id="report-date-to" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
                  </div>
                  <div>
                    <label htmlFor="report-status" className="mb-1.5 block text-sm font-medium text-text-main">
                      Estado (opcional)
                    </label>
                    <Input id="report-status" value={status} onChange={(event) => setStatus(event.target.value)} placeholder="ej. APPROVED" />
                  </div>
                  <Button type="button" onClick={handleRun} loading={runQuery.isFetching}>
                    Ejecutar
                  </Button>
                  <a href={getReportCsvUrl(selectedKey, filters)} target="_blank" rel="noreferrer">
                    <Button type="button" variant="outline">
                      Descargar CSV
                    </Button>
                  </a>
                </div>

                {runQuery.isError && <ErrorState description={getAdminErrorMessage(runQuery.error)} />}

                {activeJob && (
                  <Alert variant={activeJob.status === "FAILED" ? "danger" : "info"}>
                    {activeJob.status === "PENDING" && `Exportación en curso (${activeJob.rowCount ?? "?"} filas). Procesando en segundo plano…`}
                    {activeJob.status === "PROCESSING" && "Procesando exportación…"}
                    {activeJob.status === "READY" && (
                      <span className="flex items-center gap-3">
                        Exportación lista ({activeJob.rowCount} filas).
                        <a href={getExportJobDownloadUrl(activeJob.id)} target="_blank" rel="noreferrer">
                          <Button type="button" size="sm">
                            Descargar
                          </Button>
                        </a>
                      </span>
                    )}
                    {activeJob.status === "FAILED" && `La exportación falló: ${activeJob.errorMessage}`}
                  </Alert>
                )}

                {runResult && runResult.items.length === 0 && (
                  <EmptyState title="Sin resultados" description="No hay registros que coincidan con los filtros seleccionados." />
                )}

                {runResult && runResult.items.length > 0 && (
                  <div className="overflow-x-auto rounded-2xl border border-border-soft bg-white shadow-e1">
                    <table className="w-full min-w-[640px] text-left text-sm">
                      <caption className="sr-only">Resultados del reporte</caption>
                      <thead className="bg-brand-dark-50 text-xs font-semibold uppercase tracking-wide text-brand-dark">
                        <tr>
                          {Object.keys(runResult.items[0]!).map((column) => (
                            <th key={column} scope="col" className="px-4 py-3">
                              {column}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border-soft">
                        {runResult.items.map((row, index) => (
                          <tr key={index}>
                            {Object.keys(runResult.items[0]!).map((column) => (
                              <td key={column} className="px-4 py-3 text-text-muted">
                                {String(row[column] ?? "—")}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="px-4 py-2 text-xs text-text-muted">
                      Mostrando {runResult.items.length} de {runResult.total} resultados. <Badge variant="neutral">Usa "Descargar CSV" para el conjunto completo</Badge>
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
