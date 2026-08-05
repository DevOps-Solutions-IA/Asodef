import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge, Button, EmptyState, ErrorState, Input, PageHeader, Select, Skeleton } from "@asodef/ui";
import { searchConsentRecords } from "../../../lib/admin/admin-consent-api";
import { getAdminErrorMessage } from "../../../lib/admin/admin-error-messages";
import { queryKeys } from "../../../lib/query-keys";

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" });
}

const SUBJECT_TYPE_LABELS: Record<string, string> = {
  user: "Usuario",
  leadSubmission: "Lead",
  customer: "Cliente",
  anonymous: "Anónimo",
};

/** US-062 AC2: search consent records by subject/purpose and view full
 * evidence (policy version, ip, timestamp, method). */
export function ConsentSearchPage() {
  const [subjectType, setSubjectType] = useState<"" | "user" | "leadSubmission" | "customer">("");
  const [subjectId, setSubjectId] = useState("");
  const [purposeKey, setPurposeKey] = useState("");
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);

  const filters = {
    subjectType: subjectType || undefined,
    subjectId: subjectId.trim() || undefined,
    purposeKey: purposeKey.trim() || undefined,
  };

  const searchQuery = useQuery({
    queryKey: queryKeys.admin.consent.search(filters),
    queryFn: ({ signal }) => searchConsentRecords(filters, signal),
  });

  const selectedRecord = searchQuery.data?.items.find((record) => record.id === selectedRecordId) ?? null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Consentimientos" description="Búsqueda de registros de consentimiento por sujeto o propósito, con evidencia completa." />

      <form role="search" className="flex flex-wrap items-end gap-3" onSubmit={(event) => event.preventDefault()}>
        <div>
          <label htmlFor="consent-subject-type" className="mb-1.5 block text-sm font-medium text-text-main">
            Tipo de sujeto
          </label>
          <Select id="consent-subject-type" value={subjectType} onChange={(event) => setSubjectType(event.target.value as typeof subjectType)}>
            <option value="">Todos</option>
            <option value="customer">Cliente</option>
            <option value="user">Usuario</option>
            <option value="leadSubmission">Lead</option>
          </Select>
        </div>
        <div>
          <label htmlFor="consent-subject-id" className="mb-1.5 block text-sm font-medium text-text-main">
            ID del sujeto
          </label>
          <Input id="consent-subject-id" value={subjectId} onChange={(event) => setSubjectId(event.target.value)} placeholder="UUID" />
        </div>
        <div>
          <label htmlFor="consent-purpose" className="mb-1.5 block text-sm font-medium text-text-main">
            Propósito
          </label>
          <Input id="consent-purpose" value={purposeKey} onChange={(event) => setPurposeKey(event.target.value)} placeholder="ej. optional_marketing" />
        </div>
      </form>

      {searchQuery.isLoading && <Skeleton className="h-40 w-full" />}
      {searchQuery.isError && <ErrorState description={getAdminErrorMessage(searchQuery.error)} action={<Button onClick={() => searchQuery.refetch()}>Reintentar</Button>} />}
      {searchQuery.isSuccess && searchQuery.data.items.length === 0 && <EmptyState title="No hay registros que coincidan" description="Ajusta los filtros de búsqueda." />}

      {searchQuery.isSuccess && searchQuery.data.items.length > 0 && (
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="overflow-x-auto rounded-2xl border border-border-soft bg-white shadow-e1">
            <table className="w-full min-w-[560px] text-left text-sm">
              <caption className="sr-only">Registros de consentimiento</caption>
              <thead className="bg-brand-dark-50 text-xs font-semibold uppercase tracking-wide text-brand-dark">
                <tr>
                  <th scope="col" className="px-4 py-3">
                    Sujeto
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Propósito
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Estado
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Fecha
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-soft">
                {searchQuery.data.items.map((record) => (
                  <tr
                    key={record.id}
                    className={`cursor-pointer transition-colors duration-150 hover:bg-brand-dark-50/50 ${selectedRecordId === record.id ? "bg-brand-dark/5" : ""}`}
                    onClick={() => setSelectedRecordId(record.id)}
                  >
                    <td className="px-4 py-3">
                      {SUBJECT_TYPE_LABELS[record.subjectType]}
                      {record.subjectId && <span className="block text-xs text-text-muted">{record.subjectId}</span>}
                    </td>
                    <td className="px-4 py-3">{record.purposeKey}</td>
                    <td className="px-4 py-3">
                      <Badge variant={record.status === "GRANTED" ? "success" : "neutral"}>{record.status}</Badge>
                    </td>
                    <td className="px-4 py-3 text-text-muted">{formatDateTime(record.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <aside aria-labelledby="consent-evidence-heading" className="rounded-2xl border border-border-soft p-5">
            <h2 id="consent-evidence-heading" className="font-display text-lg font-semibold text-text-main">
              Evidencia
            </h2>
            {!selectedRecord && <p className="mt-2 text-sm text-text-muted">Selecciona un registro para ver su evidencia completa.</p>}
            {selectedRecord && (
              <dl className="mt-3 flex flex-col gap-2 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-text-muted">Versión de política</dt>
                  <dd>{selectedRecord.policyVersionNumber ?? "—"}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-text-muted">Dirección IP</dt>
                  <dd>{selectedRecord.ipAddress ?? "—"}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-text-muted">Fecha y hora</dt>
                  <dd>{formatDateTime(selectedRecord.createdAt)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-text-muted">Método</dt>
                  <dd>{selectedRecord.acceptanceMethod}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-text-muted">Fuente</dt>
                  <dd>{selectedRecord.source}</dd>
                </div>
                {selectedRecord.revokedAt && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-text-muted">Revocado</dt>
                    <dd>{formatDateTime(selectedRecord.revokedAt)}</dd>
                  </div>
                )}
              </dl>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
