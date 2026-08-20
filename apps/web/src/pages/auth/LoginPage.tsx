import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { Alert, Button, FormField, Input, PasswordInput } from "@asodef/ui";
import { ApiError } from "../../lib/api-error";
import { login, verifyMfaLogin } from "../../lib/auth/auth-api";
import type { MfaErrorCode, MfaLoginChallengeResponse } from "../../lib/auth/auth-types";
import { useAuth } from "../../lib/auth/auth-context";
import { hasAdministrativeRole, resolveLandingPath } from "../../lib/auth/role-routing";
import { isSafeInternalPath } from "../../lib/auth/safe-redirect";
import { getLoginErrorMessage, getMfaErrorMessage } from "../../lib/auth/auth-error-messages";

const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "El correo electrónico es requerido.")
    .email("Ingresa un correo electrónico válido.")
    // Normalized the same way the backend does (trim + lowercase) before
    // it ever leaves the browser - see LoginDto's own @Transform.
    .transform((value) => value.toLowerCase()),
  password: z.string().min(1, "La contraseña es requerida."),
});

type LoginFormValues = z.infer<typeof loginSchema>;

const mfaSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, "Ingresa el código de verificación.")
    .regex(/^(?:\d{6}|[A-Z0-9]{4}(?:-[A-Z0-9]{4}){2})$/i, "Ingresa un código de 6 dígitos o un código de recuperación válido."),
});

type MfaFormValues = z.infer<typeof mfaSchema>;

const TERMINAL_MFA_CODES = new Set<MfaErrorCode>([
  "MFA_CHALLENGE_INVALID",
  "MFA_CHALLENGE_EXPIRED",
  "MFA_CHALLENGE_USED",
  "MFA_ATTEMPTS_EXCEEDED",
]);

interface LocationState {
  from?: unknown;
}

export function LoginPage() {
  const { notifyLoggedIn, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const errorRef = useRef<HTMLDivElement>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [rateLimitedUntil, setRateLimitedUntil] = useState<number | null>(null);
  const [isRateLimited, setIsRateLimited] = useState(false);
  const [mfaChallenge, setMfaChallenge] = useState<MfaLoginChallengeResponse | null>(null);

  const {
    register,
    handleSubmit,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({ resolver: zodResolver(loginSchema) });

  const {
    register: registerMfa,
    handleSubmit: handleMfaSubmit,
    reset: resetMfa,
    setFocus: setMfaFocus,
    formState: { errors: mfaErrors },
  } = useForm<MfaFormValues>({ resolver: zodResolver(mfaSchema) });

  useEffect(() => {
    if (formError) {
      errorRef.current?.focus();
    }
  }, [formError]);

  // Re-enables the form automatically once the rate-limit window passes,
  // without requiring the user to reload the page.
  useEffect(() => {
    if (!rateLimitedUntil) return;
    setIsRateLimited(true);
    const remainingMs = rateLimitedUntil - Date.now();
    const timer = setTimeout(() => setIsRateLimited(false), Math.max(remainingMs, 0));
    return () => clearTimeout(timer);
  }, [rateLimitedUntil]);

  useEffect(() => {
    if (!mfaChallenge) return;
    const remainingMs = new Date(mfaChallenge.expiresAt).getTime() - Date.now();
    if (!Number.isFinite(remainingMs) || remainingMs <= 0) {
      setMfaChallenge(null);
      resetMfa();
      setFormError("El desafío de verificación expiró. Inicia sesión nuevamente.");
      return;
    }
    const timer = setTimeout(() => {
      setMfaChallenge(null);
      resetMfa();
      setFormError("El desafío de verificación expiró. Inicia sesión nuevamente.");
    }, remainingMs);
    return () => clearTimeout(timer);
  }, [mfaChallenge, resetMfa]);

  const completeAuthenticatedLogin = async () => {
    const currentUser = await notifyLoggedIn();
    const roles = currentUser?.roles ?? [];
    if (!hasAdministrativeRole(roles)) {
      await logout();
      setFormError("Este acceso está reservado para el equipo administrativo de ASODEF.");
      return;
    }
    const fromState = (location.state as LocationState | null)?.from;
    const target = isSafeInternalPath(fromState) && fromState.startsWith("/admin")
      ? fromState
      : resolveLandingPath(roles);
    navigate(target, { replace: true });
  };

  const loginMutation = useMutation({
    gcTime: 0,
    mutationFn: login,
    onSuccess: async (result) => {
      if ("mfaRequired" in result && result.mfaRequired) {
        setMfaChallenge(result);
        resetMfa();
        setFormError(null);
        return;
      }
      await completeAuthenticatedLogin();
    },
    onError: (error) => {
      // Enrollment/availability failures carry a stable MFA code even
      // though no challenge was issued. Preserve the generic credential
      // response for ordinary login failures, but surface only our fixed,
      // safe MFA vocabulary when the backend explicitly classifies one.
      const mfaPresentation = getMfaErrorMessage(error);
      const { message } = mfaPresentation.code ? mfaPresentation : getLoginErrorMessage(error);
      setFormError(message);
      if (error instanceof ApiError && error.kind === "rate_limited" && error.retryAfterSeconds) {
        setRateLimitedUntil(Date.now() + error.retryAfterSeconds * 1000);
      }
    },
  });

  useEffect(() => {
    if (mfaChallenge && loginMutation.data && "mfaRequired" in loginMutation.data) {
      // The challenge token has been copied into page-local state. Remove
      // the duplicate held by the mutation observer immediately; neither
      // representation survives navigating away from this login page.
      loginMutation.reset();
    }
  }, [loginMutation, mfaChallenge]);

  const mfaMutation = useMutation({
    gcTime: 0,
    mutationFn: ({ code }: MfaFormValues) => {
      if (!mfaChallenge) throw new Error("MFA_CHALLENGE_MISSING");
      return verifyMfaLogin({ challengeToken: mfaChallenge.challengeToken, code: code.trim().toUpperCase() });
    },
    onSuccess: async () => {
      setMfaChallenge(null);
      resetMfa();
      await completeAuthenticatedLogin();
    },
    onError: (error) => {
      const presentation = getMfaErrorMessage(error);
      setFormError(presentation.message);
      if (presentation.code && TERMINAL_MFA_CODES.has(presentation.code)) {
        setMfaChallenge(null);
        resetMfa();
      }
    },
  });

  const onSubmit = handleSubmit(
    (values) => {
      if (loginMutation.isPending || isRateLimited) return;
      setFormError(null);
      loginMutation.mutate(values);
    },
    () => {
      // Client-side validation failed - move focus to the first invalid
      // field rather than leaving focus on the submit button.
      const firstErrorField = errors.email ? "email" : errors.password ? "password" : null;
      if (firstErrorField) setFocus(firstErrorField);
    },
  );

  const isBusy = isSubmitting || loginMutation.isPending;

  if (mfaChallenge) {
    const onMfaSubmit = handleMfaSubmit(
      (values) => {
        if (mfaMutation.isPending) return;
        setFormError(null);
        mfaMutation.mutate(values);
      },
      () => setMfaFocus("code"),
    );

    return (
      <div key="mfa-challenge">
        <h1 className="font-display text-2xl font-semibold text-brand-dark">Verificación administrativa</h1>
        <p className="mt-1 text-sm text-text-muted">
          Ingresa el código de tu aplicación autenticadora o uno de tus códigos de recuperación.
        </p>

        {formError && (
          <div ref={errorRef} tabIndex={-1} className="mt-4 focus:outline-none">
            <Alert variant="danger">{formError}</Alert>
          </div>
        )}

        <form onSubmit={onMfaSubmit} noValidate className="mt-6 flex flex-col gap-4">
          <FormField label="Código de verificación" error={mfaErrors.code?.message} required>
            {(controlProps) => (
              <Input
                {...controlProps}
                autoComplete="one-time-code"
                inputMode="text"
                spellCheck={false}
                {...registerMfa("code")}
              />
            )}
          </FormField>
          <Button type="submit" loading={mfaMutation.isPending} disabled={mfaMutation.isPending}>
            Verificar e ingresar
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={mfaMutation.isPending}
            onClick={() => {
              setMfaChallenge(null);
              resetMfa();
              setFormError(null);
            }}
          >
            Volver al inicio de sesión
          </Button>
        </form>
      </div>
    );
  }

  return (
    <div key="credentials">
      <h1 className="font-display text-2xl font-semibold text-brand-dark">Acceso administrativo</h1>
      <p className="mt-1 text-sm text-text-muted">Ingresa con las credenciales asignadas para gestionar la operación interna de ASODEF.</p>

      {formError && (
        <div ref={errorRef} tabIndex={-1} className="mt-4 focus:outline-none">
          <Alert variant="danger">{formError}</Alert>
        </div>
      )}

      <form onSubmit={onSubmit} noValidate className="mt-6 flex flex-col gap-4">
        <FormField label="Correo electrónico" error={errors.email?.message} required>
          {(controlProps) => (
            <Input {...controlProps} type="email" autoComplete="email" {...register("email")} />
          )}
        </FormField>

        <FormField label="Contraseña" error={errors.password?.message} required>
          {(controlProps) => (
            <PasswordInput {...controlProps} autoComplete="current-password" {...register("password")} />
          )}
        </FormField>

        <div className="flex justify-end">
          <Link to="/recuperar-clave" className="text-sm font-medium text-brand-dark transition-colors duration-150 hover:text-brand-dark-600 hover:underline">
            ¿Olvidaste tu contraseña?
          </Link>
        </div>

        <Button type="submit" loading={isBusy} disabled={isBusy || isRateLimited} className="mt-2">
          Iniciar sesión
        </Button>
      </form>
    </div>
  );
}
