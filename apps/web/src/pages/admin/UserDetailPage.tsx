import { useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Button, ErrorState, PageHeader, Skeleton, StatusBadge } from "@asodef/ui";
import { deactivateUser, getUserDetail, reactivateUser, unlockUser } from "../../lib/admin/admin-users-api";
import { getAdminErrorMessage } from "../../lib/admin/admin-error-messages";
import { queryKeys } from "../../lib/query-keys";
import { useAuth } from "../../lib/auth/auth-context";
import { UserDetailTabs } from "./UserDetailTabs";
import { ReasonConfirmDialog } from "./ReasonConfirmDialog";
import { userStatusTone } from "./user-status-tone";
import { isStepUpCancelledError, useStepUpAction } from "../../lib/auth/use-step-up-action";

function formatDateTime(value: string | null): string {
  if (!value) return "Nunca";
  return new Date(value).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" });
}

type ActiveDialog = "deactivate" | "reactivate" | "unlock" | null;

export function UserDetailPage() {
  const { userId } = useParams<{ userId: string }>();
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [activeDialog, setActiveDialog] = useState<ActiveDialog>(null);
  const stepUp = useStepUpAction();

  const detailQuery = useQuery({
    queryKey: queryKeys.admin.users.detail(userId!),
    queryFn: ({ signal }) => getUserDetail(userId!, signal),
    enabled: !!userId,
  });

  function invalidateAfterMutation() {
    void queryClient.invalidateQueries({ queryKey: queryKeys.admin.users.detail(userId!) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.admin.users.allLists() });
    void queryClient.invalidateQueries({ queryKey: queryKeys.admin.users.stats() });
  }

  const deactivateMutation = useMutation({
    mutationFn: (reason: string) => stepUp.execute(() => deactivateUser(userId!, reason)),
    onSuccess: () => {
      invalidateAfterMutation();
      setActiveDialog(null);
    },
  });

  const reactivateMutation = useMutation({
    mutationFn: (reason: string) => stepUp.execute(() => reactivateUser(userId!, reason)),
    onSuccess: () => {
      invalidateAfterMutation();
      setActiveDialog(null);
    },
  });

  const unlockMutation = useMutation({
    mutationFn: (reason: string) => stepUp.execute(() => unlockUser(userId!, reason)),
    onSuccess: () => {
      invalidateAfterMutation();
      setActiveDialog(null);
    },
  });

  if (detailQuery.isLoading) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        <span className="sr-only" role="status">
          Cargando usuario…
        </span>
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (detailQuery.isError) {
    return <ErrorState description={getAdminErrorMessage(detailQuery.error)} action={<Button onClick={() => detailQuery.refetch()}>Reintentar</Button>} />;
  }

  const user = detailQuery.data;
  if (!user) return null;

  const { tone, label } = userStatusTone(user.status);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={user.fullName} description={user.email} />
      <UserDetailTabs userId={user.id} />

      <div className="grid gap-6 sm:grid-cols-2">
        <section aria-labelledby="user-profile-heading" className="rounded-2xl border border-border-soft p-5">
          <h2 id="user-profile-heading" className="font-display text-lg font-semibold text-text-main">
            Perfil
          </h2>
          <dl className="mt-3 flex flex-col gap-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-text-muted">Estado</dt>
              <dd>
                <StatusBadge tone={tone} label={label} />
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-text-muted">Roles</dt>
              <dd className="flex flex-wrap justify-end gap-1">
                {user.roles.length === 0 ? "Sin rol" : user.roles.map((r) => <Badge key={r}>{r}</Badge>)}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-text-muted">Creado</dt>
              <dd>{formatDateTime(user.createdAt)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-text-muted">Último acceso</dt>
              <dd>{formatDateTime(user.lastLoginAt)}</dd>
            </div>
          </dl>
        </section>

        <section aria-labelledby="user-security-heading" className="rounded-2xl border border-border-soft p-5">
          <h2 id="user-security-heading" className="font-display text-lg font-semibold text-text-main">
            Seguridad
          </h2>
          <dl className="mt-3 flex flex-col gap-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-text-muted">Bloqueado</dt>
              <dd>{user.isLocked ? <Badge variant="danger">Sí</Badge> : <Badge variant="success">No</Badge>}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-text-muted">Sesiones activas</dt>
              <dd>{user.activeSessionCount}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-text-muted">Contraseña cambiada</dt>
              <dd>{formatDateTime(user.passwordChangedAt)}</dd>
            </div>
          </dl>

          <div className="mt-5 flex flex-wrap gap-3">
            {hasPermission("users.deactivate") && user.status === "ACTIVE" && (
              <Button variant="danger" size="sm" onClick={() => setActiveDialog("deactivate")}>
                Desactivar
              </Button>
            )}
            {hasPermission("users.reactivate") && user.status !== "ACTIVE" && (
              <Button variant="secondary" size="sm" onClick={() => setActiveDialog("reactivate")}>
                Reactivar
              </Button>
            )}
            {hasPermission("users.unlock") && user.isLocked && (
              <Button variant="secondary" size="sm" onClick={() => setActiveDialog("unlock")}>
                Desbloquear
              </Button>
            )}
          </div>
        </section>
      </div>

      <ReasonConfirmDialog
        open={activeDialog === "deactivate"}
        onClose={() => setActiveDialog(null)}
        onConfirm={(reason) => deactivateMutation.mutate(reason)}
        title="Desactivar usuario"
        description="El usuario no podrá iniciar sesión y sus sesiones activas serán revocadas."
        confirmLabel="Desactivar"
        destructive
        isPending={deactivateMutation.isPending}
        errorMessage={deactivateMutation.isError && !isStepUpCancelledError(deactivateMutation.error) ? getAdminErrorMessage(deactivateMutation.error) : null}
      />
      <ReasonConfirmDialog
        open={activeDialog === "reactivate"}
        onClose={() => setActiveDialog(null)}
        onConfirm={(reason) => reactivateMutation.mutate(reason)}
        title="Reactivar usuario"
        description="El usuario podrá iniciar sesión nuevamente. Las sesiones anteriores no se restauran."
        confirmLabel="Reactivar"
        isPending={reactivateMutation.isPending}
        errorMessage={reactivateMutation.isError && !isStepUpCancelledError(reactivateMutation.error) ? getAdminErrorMessage(reactivateMutation.error) : null}
      />
      <ReasonConfirmDialog
        open={activeDialog === "unlock"}
        onClose={() => setActiveDialog(null)}
        onConfirm={(reason) => unlockMutation.mutate(reason)}
        title="Desbloquear cuenta"
        description="Se restablecen los intentos fallidos de inicio de sesión."
        confirmLabel="Desbloquear"
        isPending={unlockMutation.isPending}
        errorMessage={unlockMutation.isError && !isStepUpCancelledError(unlockMutation.error) ? getAdminErrorMessage(unlockMutation.error) : null}
      />
      {stepUp.dialog}
    </div>
  );
}
