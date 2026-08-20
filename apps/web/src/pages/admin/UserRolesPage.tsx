import { useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Button, ErrorState, PageHeader, Skeleton } from "@asodef/ui";
import { assignUserRole, getUserDetail, getUserRoles, revokeUserRole } from "../../lib/admin/admin-users-api";
import { getAdminErrorMessage } from "../../lib/admin/admin-error-messages";
import { queryKeys } from "../../lib/query-keys";
import { UserDetailTabs } from "./UserDetailTabs";
import { ReasonConfirmDialog } from "./ReasonConfirmDialog";
import { isStepUpCancelledError, useStepUpAction } from "../../lib/auth/use-step-up-action";

type PendingChange = { type: "assign" | "revoke"; roleName: string } | null;

export function UserRolesPage() {
  const { userId } = useParams<{ userId: string }>();
  const queryClient = useQueryClient();
  const [pendingChange, setPendingChange] = useState<PendingChange>(null);
  const stepUp = useStepUpAction();

  const userQuery = useQuery({
    queryKey: queryKeys.admin.users.detail(userId!),
    queryFn: ({ signal }) => getUserDetail(userId!, signal),
    enabled: !!userId,
  });

  const rolesQuery = useQuery({
    queryKey: queryKeys.admin.users.roles(userId!),
    queryFn: ({ signal }) => getUserRoles(userId!, signal),
    enabled: !!userId,
  });

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: queryKeys.admin.users.roles(userId!) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.admin.users.detail(userId!) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.admin.users.allLists() });
  }

  const assignMutation = useMutation({
    mutationFn: (input: { roleName: string; reason: string }) => stepUp.execute(() => assignUserRole(userId!, input)),
    onSuccess: () => {
      invalidate();
      setPendingChange(null);
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (input: { roleName: string; reason: string }) => stepUp.execute(() => revokeUserRole(userId!, input)),
    onSuccess: () => {
      invalidate();
      setPendingChange(null);
    },
  });

  if (userQuery.isLoading || rolesQuery.isLoading) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        <span className="sr-only" role="status">
          Cargando roles…
        </span>
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-56 w-full" />
      </div>
    );
  }

  if (userQuery.isError || rolesQuery.isError || !userQuery.data || !rolesQuery.data) {
    return (
      <ErrorState
        description={getAdminErrorMessage(userQuery.error ?? rolesQuery.error)}
        action={
          <Button
            onClick={() => {
              void userQuery.refetch();
              void rolesQuery.refetch();
            }}
          >
            Reintentar
          </Button>
        }
      />
    );
  }

  const { assigned, available } = rolesQuery.data;
  const isMutating = assignMutation.isPending || revokeMutation.isPending;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Roles" description={userQuery.data.email} />
      <UserDetailTabs userId={userQuery.data.id} />

      <div className="overflow-x-auto rounded-2xl border border-border-soft bg-white shadow-e1">
        <table className="w-full min-w-[420px] text-left text-sm">
          <caption className="sr-only">Roles disponibles para este usuario</caption>
          <thead className="bg-brand-dark-50 text-xs font-semibold uppercase tracking-wide text-brand-dark">
            <tr>
              <th scope="col" className="px-4 py-3">
                Rol
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
            {available.map((roleName) => {
              const isAssigned = assigned.includes(roleName);
              return (
                <tr key={roleName}>
                  <td className="px-4 py-3 font-medium">{roleName}</td>
                  <td className="px-4 py-3">
                    {isAssigned ? <Badge variant="success">Asignado</Badge> : <Badge variant="neutral">No asignado</Badge>}
                  </td>
                  <td className="px-4 py-3">
                    {isAssigned ? (
                      <Button
                        variant="danger"
                        size="sm"
                        disabled={isMutating}
                        onClick={() => setPendingChange({ type: "revoke", roleName })}
                      >
                        Revocar
                      </Button>
                    ) : (
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={isMutating}
                        onClick={() => setPendingChange({ type: "assign", roleName })}
                      >
                        Asignar
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ReasonConfirmDialog
        open={pendingChange !== null}
        onClose={() => setPendingChange(null)}
        onConfirm={(reason) => {
          if (!pendingChange) return;
          if (pendingChange.type === "assign") {
            assignMutation.mutate({ roleName: pendingChange.roleName, reason });
          } else {
            revokeMutation.mutate({ roleName: pendingChange.roleName, reason });
          }
        }}
        title={pendingChange?.type === "assign" ? `Asignar rol ${pendingChange.roleName}` : `Revocar rol ${pendingChange?.roleName ?? ""}`}
        confirmLabel={pendingChange?.type === "assign" ? "Asignar" : "Revocar"}
        destructive={pendingChange?.type === "revoke"}
        isPending={isMutating}
        errorMessage={
          assignMutation.isError && !isStepUpCancelledError(assignMutation.error)
            ? getAdminErrorMessage(assignMutation.error)
            : revokeMutation.isError && !isStepUpCancelledError(revokeMutation.error)
              ? getAdminErrorMessage(revokeMutation.error)
              : null
        }
      />
      {stepUp.dialog}
    </div>
  );
}
