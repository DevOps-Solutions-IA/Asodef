import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button, EmptyState, ErrorState, PageHeader, Pagination, Skeleton } from "@asodef/ui";
import { getUserDetail, listUserSecurityEvents } from "../../lib/admin/admin-users-api";
import { getAdminErrorMessage } from "../../lib/admin/admin-error-messages";
import { queryKeys } from "../../lib/query-keys";
import { UserDetailTabs } from "./UserDetailTabs";

const PAGE_SIZE = 20;

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" });
}

export function UserSecurityPage() {
  const { userId } = useParams<{ userId: string }>();
  const [page, setPage] = useState(1);

  const userQuery = useQuery({
    queryKey: queryKeys.admin.users.detail(userId!),
    queryFn: ({ signal }) => getUserDetail(userId!, signal),
    enabled: !!userId,
  });

  const filters = { page, pageSize: PAGE_SIZE };
  const eventsQuery = useQuery({
    queryKey: queryKeys.admin.users.securityEvents(userId!, filters),
    queryFn: ({ signal }) => listUserSecurityEvents(userId!, filters, signal),
    enabled: !!userId,
    placeholderData: (previous) => previous,
  });

  if (userQuery.isLoading || eventsQuery.isLoading) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        <span className="sr-only" role="status">
          Cargando historial de seguridad…
        </span>
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-56 w-full" />
      </div>
    );
  }

  if (userQuery.isError || eventsQuery.isError || !userQuery.data || !eventsQuery.data) {
    return (
      <ErrorState
        description={getAdminErrorMessage(userQuery.error ?? eventsQuery.error)}
        action={
          <Button
            onClick={() => {
              void userQuery.refetch();
              void eventsQuery.refetch();
            }}
          >
            Reintentar
          </Button>
        }
      />
    );
  }

  const events = eventsQuery.data;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Historial de seguridad" description={userQuery.data.email} />
      <UserDetailTabs userId={userQuery.data.id} />

      {events.items.length === 0 ? (
        <EmptyState title="Sin eventos de seguridad registrados" />
      ) : (
        <>
          <div className="overflow-x-auto rounded-2xl border border-border-soft">
            <table className="w-full min-w-[560px] text-left text-sm">
              <caption className="sr-only">Historial de eventos de seguridad</caption>
              <thead className="bg-bg-soft text-xs font-semibold uppercase tracking-wide text-text-muted">
                <tr>
                  <th scope="col" className="px-4 py-3">
                    Evento
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Fecha
                  </th>
                  <th scope="col" className="px-4 py-3">
                    IP
                  </th>
                  <th scope="col" className="px-4 py-3">
                    ID de solicitud
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-soft">
                {events.items.map((event) => (
                  <tr key={event.id}>
                    <td className="px-4 py-3 font-mono text-xs">{event.type}</td>
                    <td className="px-4 py-3">{formatDateTime(event.createdAt)}</td>
                    <td className="px-4 py-3 text-text-muted">{event.ipAddress ?? "—"}</td>
                    <td className="px-4 py-3 text-text-muted">{event.requestId ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={events.page} pageSize={events.pageSize} total={events.total} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}
