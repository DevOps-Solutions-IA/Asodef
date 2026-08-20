import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import { Alert, Button, Dialog, FormField, Input, PasswordInput } from "@asodef/ui";
import { ApiError } from "../api-error";
import { verifyMfaStepUp } from "./auth-api";

const STEP_UP_MESSAGE = "Se requiere autenticación reciente para realizar esta acción.";

export class StepUpCancelledError extends Error {
  constructor() {
    super("Step-up cancelled");
    this.name = "StepUpCancelledError";
  }
}

export function isStepUpCancelledError(error: unknown): error is StepUpCancelledError {
  return error instanceof StepUpCancelledError;
}

export function isStepUpRequiredError(error: unknown): boolean {
  if (!(error instanceof ApiError) || error.status !== 403) return false;
  return error.envelope?.code === "STEP_UP_REQUIRED" || error.envelope?.message === STEP_UP_MESSAGE;
}

interface PendingAction<T = unknown> {
  action: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
  onCancel?: () => void;
}

export interface StepUpExecutionOptions {
  onCancel?: () => void;
}

/**
 * Runs a protected action normally. Only an explicit STEP_UP_REQUIRED
 * response opens the challenge. After successful verification, the exact
 * captured action is retried once, directly (never recursively), so a second
 * denial fails closed instead of creating a challenge loop.
 */
export function useStepUpAction() {
  const pendingRef = useRef<PendingAction | null>(null);
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  const clearCredentials = useCallback(() => {
    setPassword("");
    setCode("");
  }, []);

  const cancel = useCallback(() => {
    if (isVerifying) return;
    const pending = pendingRef.current;
    pendingRef.current = null;
    setOpen(false);
    setError(null);
    clearCredentials();
    if (pending) {
      pending.reject(new StepUpCancelledError());
      pending.onCancel?.();
    }
  }, [clearCredentials, isVerifying]);

  useEffect(() => () => {
    const pending = pendingRef.current;
    pendingRef.current = null;
    pending?.reject(new StepUpCancelledError());
  }, []);

  const execute = useCallback(async <T,>(action: () => Promise<T>, options: StepUpExecutionOptions = {}): Promise<T> => {
    try {
      return await action();
    } catch (cause) {
      if (!isStepUpRequiredError(cause)) throw cause;
      if (pendingRef.current) throw cause;

      return new Promise<T>((resolve, reject) => {
        pendingRef.current = { action, resolve, reject, onCancel: options.onCancel } as PendingAction;
        setError(null);
        clearCredentials();
        setOpen(true);
      });
    }
  }, [clearCredentials]);

  const submit = useCallback(async () => {
    const pending = pendingRef.current;
    if (!pending || isVerifying) return;
    if (password.length < 12) {
      setError("Ingresa tu contraseña administrativa actual.");
      return;
    }
    const normalizedCode = code.trim().toUpperCase();
    if (!/^\d{6}$/.test(normalizedCode) && !/^[A-Z0-9]{4}(?:-[A-Z0-9]{4}){2}$/.test(normalizedCode)) {
      setError("Ingresa un código MFA o de recuperación válido.");
      return;
    }

    setIsVerifying(true);
    setError(null);
    try {
      await verifyMfaStepUp({ password, code: normalizedCode });
    } catch {
      setError("No pudimos verificar la contraseña y el código. Revisa los datos e intenta nuevamente.");
      setIsVerifying(false);
      return;
    }

    pendingRef.current = null;
    setOpen(false);
    clearCredentials();
    setIsVerifying(false);
    try {
      // Deliberately call the captured action directly. A second 403 is
      // returned to the original mutation and cannot reopen this dialog.
      pending.resolve(await pending.action());
    } catch (cause) {
      pending.reject(cause);
    }
  }, [clearCredentials, code, isVerifying, password]);

  const dialog: ReactElement = (
    <Dialog
      open={open}
      onClose={cancel}
      title="Confirma tu identidad"
      description="Esta operación sensible requiere tu contraseña actual y un código MFA o de recuperación."
    >
      <div className="flex flex-col gap-4">
        {error && <Alert variant="danger">{error}</Alert>}
        <FormField label="Contraseña actual" required>
          {(controlProps) => (
            <PasswordInput
              {...controlProps}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              disabled={isVerifying}
            />
          )}
        </FormField>
        <FormField label="Código de verificación" required>
          {(controlProps) => (
            <Input
              {...controlProps}
              value={code}
              onChange={(event) => setCode(event.target.value)}
              autoComplete="one-time-code"
              spellCheck={false}
              disabled={isVerifying}
            />
          )}
        </FormField>
        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={cancel} disabled={isVerifying}>Cancelar</Button>
          <Button type="button" onClick={() => void submit()} loading={isVerifying} disabled={isVerifying}>Continuar</Button>
        </div>
      </div>
    </Dialog>
  );

  return { execute, dialog, challengeOpen: open };
}
