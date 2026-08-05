import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Button, Dialog, EmptyState, ErrorState, Input, PageHeader, Pagination, Select, Skeleton, Textarea } from "@asodef/ui";
import { assignDataSubjectRequest, listDataSubjectRequests, transitionDataSubjectRequest } from "../../../lib/admin/admin-dsr-api";
import { getAdminErrorMessage } from "../../../lib/admin/admin-error-messages";
import { queryKeys } from "../../../lib/query-keys";
import { useAuth } from "../../../lib/auth/auth-context";
import { DSR_STATUS_LABELS, DSR_STATUSES } from "../../../lib/admin/admin-dsr-types";

const PAGE_SIZE = 20;
const RESOLUTION_STATUSES = new Set(["RESOLVED", "REJECTED_WITH_REASON"]);

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("es-CO", { year: "numeric", month: "short", day: "numeric" });
}

/**
 * US-062 AC3/AC5: queue with assignment, status transition (required
 * notes), due dates, and resolution entry. Negative case: transitioning
 * to a resolution-bearing status without resolution text is blocked
 * client-side here, and independently blocked server-side (already
 * enforced by TransitionDataSubjectRequestDto/the service - this form
 * mirrors that rule rather than re-inventing it).
 */
export function DataSubjectRequestQueuePage() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission("data.manage");
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [transitionTargetId, setTransitionTargetId] = useState<string | null>(null);
  const [assignTargetId, setAssignTargetId] = useState<string | null>(null);
  const [nextStatus, setNextStatus] = useState("");
  const [notes, setNotes] = useState("");
  const [resolution, setResolution] = useState("");
  const [resolutionError, setResolutionError] = useState<string | null>(null);
  const [assignedUserId, setAssignedUserId] = useState("");

  const filters = { page, pageSize: PAGE_SIZE, status: statusFilter || undefined };
  const listQuery = useQuery({ queryKey: queryKeys.admin.dsr.list(filters), queryFn: ({ signal }) => listDataSubjectRequests(filters, signal) });

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["admin", "dsr", "list"] });
  }

  const assignMutation = useMutation({
    mutationFn: () => assignDataSubjectRequest(assignTargetId!, assignedUserId),
    onSuccess: () => {
      invalidate();
      setAssignTargetId(null);
      setAssignedUserId("");
    },
  });

  const transitionMutation = useMutation({
    mutationFn: () => transitionDataSubjectRequest(transitionTargetId!, { status: nextStatus, notes, resolution: resolution || undefined }),
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
    if (RESOLUTION_STATUSES.has(nextStatus) && resolution.trim().length === 0) {
      setResolutionError("Debes ingresar el texto de resolución para este estado.");
      return;
    }
    transitionMutation.mutate();
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Solicitudes de datos" description="Cola de solicitudes de derechos de datos (habeas data)." />

      <form role="search" className="flex flex-wrap items-end gap-3" onSubmit={(event) => event.preventDefault()}>
        <div>
          <label htmlFor="dsr-status-filter" className="mb-1.5 block text-sm font-medium text-text-main">
            Estado
          </label>
          <Select
            id="dsr-status-filter"
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(event.target.value);
              setPage(1);
            }}
          >
            <option value="">Todos</option>
            {DSR_STATUSES.map((status) => (
              <option key={status} value={status}>
                {DSR_STATUS_LABELS[status]}
              </option>
            ))}
          </Select>
        </div>
      </form>

      {listQuery.isLoading && <Skeleton className="h-64 w-full" />}
      {listQuery.isError && <ErrorState description={getAdminErrorMessage(listQuery.error)} action={<Button onClick={() => listQuery.refetch()}>Reintentar</Button>} />}
      {listQuery.isSuccess && listQuery.data.items.length === 0 && <EmptyState title="Sin solicitudes" description="No hay solicitudes que coincidan con el filtro." />}

      {listQuery.isSuccess && listQuery.data.items.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-2xl border border-border-soft">
            <table className="w-full min-w-[760px] text-left text-sm">
              <caption className="sr-only">Cola de solicitudes de datos</caption>
              <thead className="bg-bg-soft text-xs font-semibold uppercase tracking-wide text-text-muted">
                <tr>
                  <th scope="col" className="px-4 py-3">
                    Solicitante
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Tipo
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
                  <tr key={item.id} className="hover:bg-bg-soft/60">
                    <td className="px-4 py-3">
                      <p className="font-medium text-text-main">{item.requesterName}</p>
                      <p className="text-xs text-text-muted">{item.publicReference}</p>
                    </td>
                    <td className="px-4 py-3 text-text-muted">{item.type}</td>
                    <td className="px-4 py-3">
                      <Badge variant="neutral">{DSR_STATUS_LABELS[item.status] ?? item.status}</Badge>
                    </td>
                    <td className="px-4 py-3 text-text-muted">{formatDate(item.dueDate)}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={!canManage}
                          title={!canManage ? "No tienes permiso para asignar solicitudes." : undefined}
                          onClick={() => setAssignTargetId(item.id)}
                        >
                          Asignar
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          disabled={!canManage}
                          title={!canManage ? "No tienes permiso para transicionar solicitudes." : undefined}
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

      <Dialog open={!!assignTargetId} onClose={() => setAssignTargetId(null)} title="Asignar solicitud" description="Ingresa el ID del usuario responsable.">
        <div className="flex flex-col gap-4">
          <div>
            <label htmlFor="dsr-assign-user" className="mb-1.5 block text-sm font-medium text-text-main">
              ID de usuario asignado
            </label>
            <Input id="dsr-assign-user" value={assignedUserId} onChange={(event) => setAssignedUserId(event.target.value)} />
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
            <label htmlFor="dsr-next-status" className="mb-1.5 block text-sm font-medium text-text-main">
              Nuevo estado
            </label>
            <Select id="dsr-next-status" value={nextStatus} onChange={(event) => setNextStatus(event.target.value)}>
              <option value="">Selecciona un estado</option>
              {DSR_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {DSR_STATUS_LABELS[status]}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label htmlFor="dsr-notes" className="mb-1.5 block text-sm font-medium text-text-main">
              Notas
            </label>
            <Textarea id="dsr-notes" required rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} />
          </div>
          {RESOLUTION_STATUSES.has(nextStatus) && (
            <div>
              <label htmlFor="dsr-resolution" className="mb-1.5 block text-sm font-medium text-text-main">
                Texto de resolución
              </label>
              <Textarea id="dsr-resolution" rows={3} value={resolution} onChange={(event) => setResolution(event.target.value)} />
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
