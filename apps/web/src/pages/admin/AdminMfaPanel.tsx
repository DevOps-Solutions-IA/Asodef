import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Card, Checkbox, FormField, Input, Skeleton } from "@asodef/ui";
import {
  beginMfaEnrollment,
  confirmMfaEnrollment,
  getMfaStatus,
  regenerateMfaRecoveryCodes,
  revokeMfa,
} from "../../lib/auth/auth-api";
import type { MfaEnrollmentResponse } from "../../lib/auth/auth-types";
import { getMfaErrorMessage } from "../../lib/auth/auth-error-messages";
import { queryKeys } from "../../lib/query-keys";
import { isStepUpCancelledError, useStepUpAction } from "../../lib/auth/use-step-up-action";

function normalizeMfaCode(value: string): string {
  return value.trim().toUpperCase();
}

export function AdminMfaPanel() {
  const queryClient = useQueryClient();
  const [enrollment, setEnrollment] = useState<MfaEnrollmentResponse | null>(null);
  const [enrollmentPassword, setEnrollmentPassword] = useState("");
  const [enrollmentCode, setEnrollmentCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [codesAcknowledged, setCodesAcknowledged] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const statusQuery = useQuery({
    queryKey: queryKeys.auth.mfaStatus(),
    queryFn: ({ signal }) => getMfaStatus(signal),
    retry: false,
  });

  const refreshStatus = async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.auth.mfaStatus() });
  };

  const beginMutation = useMutation({
    gcTime: 0,
    mutationFn: () => beginMfaEnrollment({ password: enrollmentPassword }),
    onSuccess: (result) => {
      setEnrollment(result);
      // The begin request has completed. Do not retain the administrative
      // password while the operator configures the authenticator; require a
      // fresh entry at the confirmation boundary.
      setEnrollmentPassword("");
      setEnrollmentCode("");
      setActionError(null);
    },
    onError: (error) => setActionError(getMfaErrorMessage(error).message),
  });

  const confirmMutation = useMutation({
    gcTime: 0,
    mutationFn: () => confirmMfaEnrollment({
      password: enrollmentPassword,
      code: normalizeMfaCode(enrollmentCode),
    }),
    onSuccess: async (result) => {
      // The secret is no longer needed once enrollment is confirmed.
      // Clear both the explicit page state and React Query's in-memory
      // mutation result so it cannot linger behind the recovery-code view.
      beginMutation.reset();
      setEnrollment(null);
      setEnrollmentCode("");
      setEnrollmentPassword("");
      setRecoveryCodes([...result.recoveryCodes]);
      setCodesAcknowledged(false);
      setActionError(null);
      await refreshStatus();
    },
    onError: (error) => {
      const presentation = getMfaErrorMessage(error);
      setActionError(presentation.message);
      if (presentation.code === "MFA_ENROLLMENT_EXPIRED" ||
          presentation.code === "MFA_NOT_AVAILABLE" ||
          presentation.code === "MFA_ATTEMPTS_EXCEEDED") {
        beginMutation.reset();
        setEnrollment(null);
        setEnrollmentCode("");
        setEnrollmentPassword("");
      }
    },
  });

  if (statusQuery.isLoading) {
    return <Skeleton className="h-48 w-full" aria-label="Cargando configuración MFA" />;
  }

  if (statusQuery.isError || !statusQuery.data) {
    return (
      <Card>
        <Alert variant="danger">No fue posible consultar la configuración MFA.</Alert>
        <Button className="mt-4" variant="secondary" onClick={() => void statusQuery.refetch()}>
          Reintentar
        </Button>
      </Card>
    );
  }

  if (recoveryCodes) {
    return (
      <Card aria-labelledby="mfa-recovery-codes-title">
        <h2 id="mfa-recovery-codes-title" className="text-lg font-semibold text-brand-dark">Códigos de recuperación</h2>
        <Alert variant="warning" className="mt-4">
          Estos códigos se muestran una sola vez. Guárdalos en un lugar seguro; cada código puede utilizarse una sola vez.
        </Alert>
        <ul className="mt-4 grid gap-2 rounded-2xl border border-border-soft bg-bg-soft p-4 font-mono text-sm sm:grid-cols-2" aria-label="Códigos de recuperación nuevos">
          {recoveryCodes.map((code) => <li key={code}>{code}</li>)}
        </ul>
        <Checkbox
          className="mt-5"
          checked={codesAcknowledged}
          onChange={(event) => setCodesAcknowledged(event.target.checked)}
          label="Confirmo que guardé los códigos de recuperación en un lugar seguro."
        />
        <Button
          className="mt-4"
          disabled={!codesAcknowledged}
          onClick={() => {
            confirmMutation.reset();
            setRecoveryCodes(null);
            setCodesAcknowledged(false);
          }}
        >
          Finalizar
        </Button>
      </Card>
    );
  }

  const status = statusQuery.data;
  return (
    <Card id="mfa" aria-labelledby="mfa-panel-title">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 id="mfa-panel-title" className="text-lg font-semibold text-brand-dark">Autenticación multifactor</h2>
          <p className="mt-1 text-sm text-text-muted">
            Protege el acceso administrativo con una aplicación autenticadora y códigos de recuperación.
          </p>
        </div>
        <span className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ${status.enrolled ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}`}>
          {status.enrolled ? "Activa" : "No configurada"}
        </span>
      </div>

      {actionError && <Alert variant="danger" className="mt-4">{actionError}</Alert>}

      {enrollment ? (
        <EnrollmentForm
          enrollment={enrollment}
          password={enrollmentPassword}
          code={enrollmentCode}
          onPasswordChange={setEnrollmentPassword}
          onCodeChange={setEnrollmentCode}
          pending={confirmMutation.isPending}
          onConfirm={() => {
            if (enrollmentPassword.length < 12) {
              setActionError("Ingresa nuevamente tu contraseña administrativa actual.");
              return;
            }
            if (!/^\d{6}$/.test(enrollmentCode.trim())) {
              setActionError("Ingresa el código de 6 dígitos generado por tu aplicación autenticadora.");
              return;
            }
            setActionError(null);
            confirmMutation.mutate();
          }}
          onCancel={() => {
            beginMutation.reset();
            setEnrollment(null);
            setEnrollmentCode("");
            setEnrollmentPassword("");
            setActionError(null);
          }}
        />
      ) : status.enrolled ? (
        <ActiveMfaActions
          recoveryCodesRemaining={status.recoveryCodesRemaining}
          onCodes={(codes) => {
            setRecoveryCodes([...codes]);
            setCodesAcknowledged(false);
          }}
          onChanged={refreshStatus}
        />
      ) : (
        <div className="mt-5 space-y-4">
          {status.required && (
            <Alert variant="warning" className="mb-4">MFA es obligatorio para esta cuenta administrativa.</Alert>
          )}
          <FormField label="Contraseña actual" required>
            {(controlProps) => (
              <Input
                {...controlProps}
                type="password"
                value={enrollmentPassword}
                onChange={(event) => setEnrollmentPassword(event.target.value)}
                autoComplete="current-password"
              />
            )}
          </FormField>
          <Button
            loading={beginMutation.isPending}
            disabled={beginMutation.isPending}
            onClick={() => {
              if (enrollmentPassword.length < 12) {
                setActionError("Ingresa tu contraseña administrativa actual.");
                return;
              }
              setActionError(null);
              beginMutation.mutate();
            }}
          >
            Configurar MFA
          </Button>
        </div>
      )}
    </Card>
  );
}

function EnrollmentForm({
  enrollment,
  password,
  code,
  pending,
  onPasswordChange,
  onCodeChange,
  onConfirm,
  onCancel,
}: {
  enrollment: MfaEnrollmentResponse;
  password: string;
  code: string;
  pending: boolean;
  onPasswordChange: (value: string) => void;
  onCodeChange: (value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="mt-5 space-y-4">
      <Alert variant="info">
        Agrega esta cuenta en tu aplicación autenticadora. La configuración expira el {new Date(enrollment.expiresAt).toLocaleString("es-CO")}.
      </Alert>
      <div>
        <p className="text-sm font-medium text-text-main">Clave de configuración manual</p>
        <code className="mt-2 block overflow-x-auto rounded-xl bg-bg-soft p-3 text-sm" data-testid="mfa-enrollment-secret">
          {enrollment.secret}
        </code>
        <a className="mt-2 inline-block text-sm font-medium text-brand-dark underline" href={enrollment.otpauthUri}>
          Abrir en una aplicación compatible
        </a>
      </div>
      <FormField label="Contraseña actual" required>
        {(controlProps) => (
          <Input
            {...controlProps}
            type="password"
            value={password}
            onChange={(event) => onPasswordChange(event.target.value)}
            autoComplete="current-password"
          />
        )}
      </FormField>
      <FormField label="Código de 6 dígitos" required>
        {(controlProps) => (
          <Input
            {...controlProps}
            value={code}
            onChange={(event) => onCodeChange(event.target.value)}
            autoComplete="one-time-code"
            inputMode="numeric"
            maxLength={6}
          />
        )}
      </FormField>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button loading={pending} disabled={pending} onClick={onConfirm}>Confirmar MFA</Button>
        <Button variant="ghost" disabled={pending} onClick={onCancel}>Cancelar</Button>
      </div>
    </div>
  );
}

function ActiveMfaActions({
  recoveryCodesRemaining,
  onCodes,
  onChanged,
}: {
  recoveryCodesRemaining: number;
  onCodes: (codes: string[]) => void;
  onChanged: () => Promise<void>;
}) {
  const [error, setError] = useState<string | null>(null);
  const stepUp = useStepUpAction();

  const regenerateMutation = useMutation({
    gcTime: 0,
    mutationFn: () => stepUp.execute(regenerateMfaRecoveryCodes),
    onSuccess: async (result) => {
      setError(null);
      onCodes(result.recoveryCodes);
      await onChanged();
    },
    onError: (cause) => {
      if (!isStepUpCancelledError(cause)) setError(getMfaErrorMessage(cause).message);
    },
  });

  const revokeMutation = useMutation({
    mutationFn: () => stepUp.execute(revokeMfa),
    onSuccess: async () => {
      setError(null);
      await onChanged();
    },
    onError: (cause) => {
      if (!isStepUpCancelledError(cause)) setError(getMfaErrorMessage(cause).message);
    },
  });

  const pending = regenerateMutation.isPending || revokeMutation.isPending;

  return (
    <div className="mt-5">
      <p className="text-sm text-text-muted">Códigos de recuperación disponibles: <strong>{recoveryCodesRemaining}</strong></p>
      {error && <Alert variant="danger" className="mt-4">{error}</Alert>}
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Button variant="secondary" loading={regenerateMutation.isPending} disabled={pending} onClick={() => { setError(null); regenerateMutation.mutate(); }}>
          Regenerar códigos
        </Button>
        <Button variant="danger" loading={revokeMutation.isPending} disabled={pending} onClick={() => { setError(null); revokeMutation.mutate(); }}>
          Desactivar MFA
        </Button>
      </div>
      {stepUp.dialog}
    </div>
  );
}
