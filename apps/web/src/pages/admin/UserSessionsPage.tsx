import { useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Button, EmptyState, ErrorState, PageHeader, Skeleton } from "@asodef/ui";
import { getUserDetail, listUserSessions, revokeUserSessions } from "../../lib/admin/admin-users-api";
import { getAdminErrorMessage } from "../../lib/admin/admin-error-messages";
import { queryKeys } from "../../lib/query-keys";
import { UserDetailTabs } from "./UserDetailTabs";
import { ReasonConfirmDialog } from "./ReasonConfirmDialog";

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" });
}

type PendingRevoke = { sessionId?: string } | null;

export function UserSessionsPage() {
  const { userId } = useParams<{ userId: string }>();
  const queryClient = useQueryClient();
  const [pendingRevoke, setPendingRevoke] = useState<PendingRevoke>(null);

  const userQuery = useQuery({
    queryKey: queryKeys.admin.users.detail(userId!),
    queryFn: ({ signal }) => getUserDetail(userId!, signal),
    enabled: !!userId,
  });

  const sessionsQuery = useQuery({
    queryKey: queryKeys.admin.users.sessions(userId!),
    queryFn: ({ signal }) => listUserSessions(userId!, signal),
    enabled: !!userId,
  });

  const revokeMutation = useMutation({
    mutationFn: (input: { sessionId?: string; reason: string }) => revokeUserSessions(userId!, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.users.sessions(userId!) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.users.detail(userId!) });
      setPendingRevoke(null);
    },
  });

  if (userQuery.isLoading || sessionsQuery.isLoading) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        <span className="sr-only" role="status">
          Cargando sesiones…
        </span>
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-56 w-full" />
      </div>
    );
  }

  if (userQuery.isError || sessionsQuery.isError || !userQuery.data || !sessionsQuery.data) {
    return (
      <ErrorState
        description={getAdminErrorMessage(userQuery.error ?? sessionsQuery.error)}
        action={
          <Button
            onClick={() => {
              void userQuery.refetch();
              void sessionsQuery.refetch();
            }}
          >
            Reintentar
          </Button>
        }
      />
    );
  }

  const sessions = sessionsQuery.data;
  const hasActiveSessions = sessions.some((s) => s.isActive);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Sesiones"
        description={userQuery.data.email}
        actions={
          hasActiveSessions ? (
            <Button variant="danger" size="sm" onClick={() => setPendingRevoke({})}>
              Revocar todas
            </Button>
          ) : undefined
        }
      />
      <UserDetailTabs userId={userQuery.data.id} />

      {sessions.length === 0 ? (
        <EmptyState title="Sin sesiones registradas" />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border-soft bg-white shadow-e1">
          <table className="w-full min-w-[720px] text-left text-sm">
            <caption className="sr-only">Sesiones del usuario</caption>
            <thead className="bg-brand-dark-50 text-xs font-semibold uppercase tracking-wide text-brand-dark">
              <tr>
                <th scope="col" className="px-4 py-3">
                  Creada
                </th>
                <th scope="col" className="px-4 py-3">
                  Último uso
                </th>
                <th scope="col" className="px-4 py-3">
                  IP
                </th>
                <th scope="col" className="px-4 py-3">
                  Estado
                </th>
                <th scope="col" className="px-4 py-3">
                  Acción
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-soft">
              {sessions.map((session) => (
                <tr key={session.id}>
                  <td className="px-4 py-3">{formatDateTime(session.createdAt)}</td>
                  <td className="px-4 py-3">{formatDateTime(session.lastUsedAt)}</td>
                  <td className="px-4 py-3 text-text-muted">{session.ipAddress ?? "—"}</td>
                  <td className="px-4 py-3">
                    {session.isCurrent ? (
                      <Badge variant="info">Sesión actual</Badge>
                    ) : session.isActive ? (
                      <Badge variant="success">Activa</Badge>
                    ) : (
                      <Badge variant="neutral">Revocada</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {session.isActive && !session.isCurrent && (
                      <Button variant="outline" size="sm" onClick={() => setPendingRevoke({ sessionId: session.id })}>
                        Revocar
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ReasonConfirmDialog
        open={pendingRevoke !== null}
        onClose={() => setPendingRevoke(null)}
        onConfirm={(reason) => revokeMutation.mutate({ sessionId: pendingRevoke?.sessionId, reason })}
        title={pendingRevoke?.sessionId ? "Revocar sesión" : "Revocar todas las sesiones"}
        description="El usuario deberá iniciar sesión nuevamente en el dispositivo afectado."
        confirmLabel="Revocar"
        destructive
        isPending={revokeMutation.isPending}
        errorMessage={revokeMutation.isError ? getAdminErrorMessage(revokeMutation.error) : null}
      />
    </div>
  );
}
