import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Card, FormField, PasswordInput, Skeleton } from "@asodef/ui";
import { changePassword } from "../../lib/auth/auth-api";
import { getChangePasswordErrorMessage } from "../../lib/auth/auth-error-messages";
import { broadcastLogout } from "../../lib/auth/cross-tab-logout";
import { getAdminSystemStatus } from "../../lib/admin/admin-system-api";
import { getUserDetail, getUserStats, listUserSessions, revokeUserSessions } from "../../lib/admin/admin-users-api";
import { getAdminErrorMessage } from "../../lib/admin/admin-error-messages";
import { queryKeys } from "../../lib/query-keys";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "../../lib/auth/password-policy";
import { isStepUpCancelledError, useStepUpAction } from "../../lib/auth/use-step-up-action";
import { ReasonConfirmDialog } from "./ReasonConfirmDialog";

export function CurrentAdminSecurityOverview({ userId }: { userId: string }) {
  const queryClient = useQueryClient();
  const stepUp = useStepUpAction();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [revokeOpen, setRevokeOpen] = useState(false);

  const detailQuery = useQuery({
    queryKey: queryKeys.admin.users.detail(userId),
    queryFn: ({ signal }) => getUserDetail(userId, signal),
  });
  const statsQuery = useQuery({ queryKey: queryKeys.admin.users.stats(), queryFn: ({ signal }) => getUserStats(signal) });
  const sessionsQuery = useQuery({
    queryKey: queryKeys.admin.users.sessions(userId),
    queryFn: ({ signal }) => listUserSessions(userId, signal),
  });
  const systemQuery = useQuery({ queryKey: queryKeys.admin.system(), queryFn: ({ signal }) => getAdminSystemStatus(signal) });

  const passwordMutation = useMutation({
    mutationFn: () => stepUp.execute(() => changePassword({ currentPassword, newPassword, confirmPassword })),
    onSuccess: async () => {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setFormError(null);
      setSuccess("La contraseña se actualizó y las demás sesiones fueron revocadas.");
      // The backend invalidates the other sessions atomically. Notify other
      // tabs immediately without storing or broadcasting any credential.
      broadcastLogout();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.auth.me() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.admin.users.detail(userId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.admin.users.sessions(userId) }),
      ]);
    },
    onError: (error) => {
      if (isStepUpCancelledError(error)) return;
      setSuccess(null);
      setFormError(getChangePasswordErrorMessage(error).message);
    },
  });

  const revokeOthersMutation = useMutation({
    mutationFn: (reason: string) => stepUp.execute(() => revokeUserSessions(userId, { reason })),
    onSuccess: async () => {
      setRevokeOpen(false);
      setSuccess("Las demás sesiones activas fueron revocadas.");
      await queryClient.invalidateQueries({ queryKey: queryKeys.admin.users.sessions(userId) });
    },
  });

  const activeSessions = sessionsQuery.data?.filter((session) => session.isActive).length;
  const otherActiveSessions = sessionsQuery.data?.filter((session) => session.isActive && !session.isCurrent).length ?? 0;
  const hasReadFailure = [detailQuery, statsQuery, sessionsQuery, systemQuery].some((query) => query.isError);

  function submitPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (passwordMutation.isPending) return;
    if (currentPassword.length < 1) {
      setFormError("Ingresa tu contraseña actual.");
      return;
    }
    if (newPassword.length < PASSWORD_MIN_LENGTH || newPassword.length > PASSWORD_MAX_LENGTH) {
      setFormError(`La nueva contraseña debe tener entre ${PASSWORD_MIN_LENGTH} y ${PASSWORD_MAX_LENGTH} caracteres.`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setFormError("Las contraseñas nuevas no coinciden.");
      return;
    }
    setFormError(null);
    setSuccess(null);
    passwordMutation.mutate();
  }

  return (
    <div className="space-y-5">
      <section aria-labelledby="security-overview-heading" className="data-surface p-5 sm:p-6">
        <h2 id="security-overview-heading" className="font-display text-lg font-semibold text-text-main">Resumen de protección</h2>
        <p className="mt-1 text-sm text-text-muted">Datos actuales de la cuenta y sus dependencias de seguridad.</p>
        {hasReadFailure && <Alert className="mt-4" variant="warning">Parte del estado no pudo verificarse; los valores afectados permanecen desconocidos.</Alert>}
        <dl className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <SecurityMetric label="Último acceso" value={formatTimestamp(detailQuery.data?.lastLoginAt)} loading={detailQuery.isLoading} />
          <SecurityMetric label="Contraseña actualizada" value={formatTimestamp(detailQuery.data?.passwordChangedAt)} loading={detailQuery.isLoading} />
          <SecurityMetric label="Intentos fallidos globales (24 h)" value={statsQuery.data?.recentLoginFailures24h?.toLocaleString("es-CO")} loading={statsQuery.isLoading} />
          <SecurityMetric label="Sesiones activas" value={activeSessions?.toLocaleString("es-CO")} loading={sessionsQuery.isLoading} />
          <SecurityMetric label="Canal de recuperación" value={systemQuery.data?.security.recoveryChannel === "CONFIGURED" ? "Configurado" : systemQuery.data ? "No configurado" : undefined} loading={systemQuery.isLoading} />
          <SecurityMetric label="Invariante administrativa" value={systemQuery.data?.security.status === "VERIFIED" ? "Verificada" : systemQuery.data ? "No verificada" : undefined} loading={systemQuery.isLoading} />
        </dl>
        <div className="mt-5">
          <Button variant="danger" disabled={otherActiveSessions === 0 || sessionsQuery.isLoading} onClick={() => setRevokeOpen(true)}>
            Revocar otras sesiones{otherActiveSessions > 0 ? ` (${otherActiveSessions})` : ""}
          </Button>
        </div>
      </section>

      <Card aria-labelledby="change-password-heading">
        <h2 id="change-password-heading" className="text-lg font-semibold text-brand-dark">Cambiar contraseña</h2>
        <p className="mt-1 text-sm text-text-muted">La operación conserva esta sesión y revoca las demás de forma atómica.</p>
        {success && <Alert className="mt-4" variant="success">{success}</Alert>}
        {formError && <Alert className="mt-4" variant="danger">{formError}</Alert>}
        <form className="mt-5 grid gap-4" onSubmit={submitPassword} noValidate>
          <FormField label="Contraseña actual" required>
            {(props) => <PasswordInput {...props} value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" />}
          </FormField>
          <FormField label="Nueva contraseña" hint={`Entre ${PASSWORD_MIN_LENGTH} y ${PASSWORD_MAX_LENGTH} caracteres.`} required>
            {(props) => <PasswordInput {...props} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" />}
          </FormField>
          <FormField label="Confirmar nueva contraseña" required>
            {(props) => <PasswordInput {...props} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" />}
          </FormField>
          <Button className="w-fit" type="submit" loading={passwordMutation.isPending} disabled={passwordMutation.isPending}>Actualizar contraseña</Button>
        </form>
      </Card>

      <ReasonConfirmDialog
        open={revokeOpen}
        onClose={() => setRevokeOpen(false)}
        onConfirm={(reason) => revokeOthersMutation.mutate(reason)}
        title="Revocar otras sesiones"
        description="Tu sesión actual permanecerá activa. Las demás deberán autenticarse nuevamente."
        confirmLabel="Revocar"
        destructive
        isPending={revokeOthersMutation.isPending}
        errorMessage={revokeOthersMutation.isError && !isStepUpCancelledError(revokeOthersMutation.error) ? getAdminErrorMessage(revokeOthersMutation.error) : null}
      />
      {stepUp.dialog}
    </div>
  );
}

function SecurityMetric({ label, value, loading }: { label: string; value?: string; loading: boolean }) {
  return (
    <div className="rounded-xl border border-border-soft bg-bg-soft/40 p-4">
      <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-text-muted">{label}</dt>
      <dd className="mt-2 text-sm font-semibold text-text-main">{loading ? <Skeleton className="h-5 w-28" /> : value ?? <span className="text-warning">Desconocido</span>}</dd>
    </div>
  );
}

function formatTimestamp(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" });
}
