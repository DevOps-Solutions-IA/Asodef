import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Button, Dialog, EmptyState, ErrorState, Input, PageHeader, Pagination, Select, Skeleton, Textarea } from "@asodef/ui";
import { assignPqrCase, listPqrCases, transitionPqrCase } from "../../../lib/admin/admin-pqr-api";
import { getAdminErrorMessage } from "../../../lib/admin/admin-error-messages";
import { queryKeys } from "../../../lib/query-keys";
import { useAuth } from "../../../lib/auth/auth-context";
import { PQR_QUEUE_STATUS_LABELS, PQR_QUEUE_STATUSES } from "../../../lib/admin/admin-pqr-types";

const PAGE_SIZE = 20;
// Negative case (AC): resolving a PQR case without resolution text is
// blocked - mirrors the server's own rule (transition() rejects CLOSED
// with no resolution on record); RESOLVED is included here too since
// "resolving" the case is exactly this transition.
const RESOLUTION_REQUIRED_STATUSES = new Set(["RESOLVED", "CLOSED"]);

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("es-CO", { year: "numeric", month: "short", day: "numeric" });
}

/** US-062 AC3/AC5: PQR queue with assignment, status transition (required
 * notes), due dates, and resolution entry. */
export function PqrQueuePage() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission("pqr.manage");
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [transitionTargetId, setTransitionTargetId] = useState<string | null>(null);
  const [assignTargetId, setAssignTargetId] = useState<string | null>(null);
  const [nextStatus, setNextStatus] = useState("");
  const [notes, setNotes] = useState("");
  const [resolution, setResolution] = useState("");
  const [resolutionError, setResolutionError] = useState<string | null>(null);
  const [assignedTeam, setAssignedTeam] = useState("");

  const filters = { page, pageSize: PAGE_SIZE, status: statusFilter || undefined };
  const listQuery = useQuery({ queryKey: queryKeys.admin.pqr.list(filters), queryFn: ({ signal }) => listPqrCases(filters, signal) });

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["admin", "pqr", "list"] });
  }

  const assignMutation = useMutation({
    mutationFn: () => assignPqrCase(assignTargetId!, assignedTeam),
    onSuccess: () => {
      invalidate();
      setAssignTargetId(null);
      setAssignedTeam("");
    },
  });

  const transitionMutation = useMutation({
    mutationFn: () => transitionPqrCase(transitionTargetId!, { status: nextStatus, notes, resolution: resolution || undefined }),
    onSuccess: () => {
      invalidate();
      closeTransitionDialog();
    },
  });

  function closeTransitionDialog() {
    setTransitionTargetId(null);
    setNextStatus("");
    setNotes("");
    setResolution("");
    setResolutionError(null);
  }

  function handleTransitionSubmit() {
    setResolutionError(null);
    if (RESOLUTION_REQUIRED_STATUSES.has(nextStatus) && resolution.trim().length === 0) {
      setResolutionError("Debes ingresar el texto de resolución para este estado.");
      return;
    }
    transitionMutation.mutate();
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="PQR" description="Cola de peticiones, quejas, reclamos y sugerencias." />

      <form role="search" className="flex flex-wrap items-end gap-3" onSubmit={(event) => event.preventDefault()}>
        <div>
          <label htmlFor="pqr-status-filter" className="mb-1.5 block text-sm font-medium text-text-main">
            Estado
          </label>
          <Select
            id="pqr-status-filter"
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(event.target.value);
              setPage(1);
            }}
          >
            <option value="">Todos</option>
            {PQR_QUEUE_STATUSES.map((status) => (
              <option key={status} value={status}>
                {PQR_QUEUE_STATUS_LABELS[status]}
              </option>
            ))}
          </Select>
        </div>
      </form>

      {listQuery.isLoading && <Skeleton className="h-64 w-full" />}
      {listQuery.isError && <ErrorState description={getAdminErrorMessage(listQuery.error)} action={<Button onClick={() => listQuery.refetch()}>Reintentar</Button>} />}
      {listQuery.isSuccess && listQuery.data.items.length === 0 && <EmptyState title="Sin casos" description="No hay casos PQR que coincidan con el filtro." />}

      {listQuery.isSuccess && listQuery.data.items.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-2xl border border-border-soft bg-white shadow-e1">
            <table className="w-full min-w-[760px] text-left text-sm">
              <caption className="sr-only">Cola de casos PQR</caption>
              <thead className="bg-brand-dark-50 text-xs font-semibold uppercase tracking-wide text-brand-dark">
                <tr>
                  <th scope="col" className="px-4 py-3">
                    Solicitante
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Categoría
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Estado
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Vencimiento
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-soft">
                {listQuery.data.items.map((item) => (
                  <tr key={item.id} className="transition-colors duration-150 hover:bg-brand-dark-50/50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-text-main">{item.applicantName}</p>
                      <p className="text-xs text-text-muted">{item.caseNumber}</p>
                    </td>
                    <td className="px-4 py-3 text-text-muted">{item.category}</td>
                    <td className="px-4 py-3">
                      <Badge variant="neutral">{PQR_QUEUE_STATUS_LABELS[item.status] ?? item.status}</Badge>
                    </td>
                    <td className="px-4 py-3 text-text-muted">{formatDate(item.dueDate)}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={!canManage}
                          title={!canManage ? "No tienes permiso para asignar casos." : undefined}
                          onClick={() => setAssignTargetId(item.id)}
                        >
                          Asignar
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          disabled={!canManage}
                          title={!canManage ? "No tienes permiso para transicionar casos." : undefined}
                          onClick={() => setTransitionTargetId(item.id)}
                        >
                          Cambiar estado
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Pagination page={listQuery.data.page} pageSize={listQuery.data.pageSize} total={listQuery.data.total} onPageChange={setPage} />
        </>
      )}

      <Dialog open={!!assignTargetId} onClose={() => setAssignTargetId(null)} title="Asignar caso" description="Ingresa el equipo responsable.">
        <div className="flex flex-col gap-4">
          <div>
            <label htmlFor="pqr-assign-team" className="mb-1.5 block text-sm font-medium text-text-main">
              Equipo asignado
            </label>
            <Input id="pqr-assign-team" value={assignedTeam} onChange={(event) => setAssignedTeam(event.target.value)} />
          </div>
          {assignMutation.isError && <ErrorState description={getAdminErrorMessage(assignMutation.error)} />}
          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => setAssignTargetId(null)} disabled={assignMutation.isPending}>
              Cancelar
            </Button>
            <Button type="button" loading={assignMutation.isPending} onClick={() => assignMutation.mutate()}>
              Asignar
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog open={!!transitionTargetId} onClose={closeTransitionDialog} title="Cambiar estado" description="Las notas son obligatorias para cada transición de estado.">
        <div className="flex flex-col gap-4">
          <div>
            <label htmlFor="pqr-next-status" className="mb-1.5 block text-sm font-medium text-text-main">
              Nuevo estado
            </label>
            <Select id="pqr-next-status" value={nextStatus} onChange={(event) => setNextStatus(event.target.value)}>
              <option value="">Selecciona un estado</option>
              {PQR_QUEUE_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {PQR_QUEUE_STATUS_LABELS[status]}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label htmlFor="pqr-notes" className="mb-1.5 block text-sm font-medium text-text-main">
              Notas
            </label>
            <Textarea id="pqr-notes" required rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} />
          </div>
          {RESOLUTION_REQUIRED_STATUSES.has(nextStatus) && (
            <div>
              <label htmlFor="pqr-resolution" className="mb-1.5 block text-sm font-medium text-text-main">
                Texto de resolución
              </label>
              <Textarea id="pqr-resolution" rows={3} value={resolution} onChange={(event) => setResolution(event.target.value)} />
              {resolutionError && <p className="mt-1 text-sm text-danger">{resolutionError}</p>}
            </div>
          )}
          {transitionMutation.isError && <ErrorState description={getAdminErrorMessage(transitionMutation.error)} />}
          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={closeTransitionDialog} disabled={transitionMutation.isPending}>
              Cancelar
            </Button>
            <Button type="button" loading={transitionMutation.isPending} disabled={!nextStatus || !notes.trim()} onClick={handleTransitionSubmit}>
              Confirmar
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
