import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { Alert, Button, EmptyState, FormField, PasswordInput } from "@asodef/ui";
import { AlertTriangle } from "lucide-react";
import { resetPassword } from "../../lib/auth/auth-api";
import { getResetPasswordErrorMessage } from "../../lib/auth/auth-error-messages";
import { PASSWORD_MIN_LENGTH, passwordFieldSchema } from "../../lib/auth/password-policy";

const resetPasswordSchema = z
  .object({
    newPassword: passwordFieldSchema,
    confirmPassword: z.string().min(1, "Confirma tu nueva contraseña."),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    message: "Las contraseñas no coinciden.",
    path: ["confirmPassword"],
  });

type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>;

const REDIRECT_DELAY_MS = 3000;

export function ResetPasswordPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const messageRef = useRef<HTMLDivElement>(null);

  // Extracted exactly once, on mount, then kept only in this component's
  // in-memory state - never re-read from the URL again afterward (US-010
  // section 3: "extract the token once... keep it only in short-lived
  // in-memory state").
  const [token] = useState<string | null>(() => searchParams.get("token"));
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [succeeded, setSucceeded] = useState(false);

  // Strips the token from the visible browser URL immediately - via the
  // router's own setSearchParams (React Router's equivalent of
  // history.replaceState: it does not push a new history entry and does
  // not navigate away from this page), so it never lingers in the
  // address bar, browser history, or a referrer header sent from here.
  useEffect(() => {
    if (searchParams.has("token")) {
      setSearchParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          next.delete("token");
          return next;
        },
        { replace: true },
      );
    }
    // Runs once on mount only - intentionally not re-running on
    // searchParams identity changes, which would re-trigger on the very
    // replaceState this effect itself causes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const {
    register,
    handleSubmit,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordFormValues>({ resolver: zodResolver(resetPasswordSchema) });

  useEffect(() => {
    if (errorMessage || succeeded) {
      messageRef.current?.focus();
    }
  }, [errorMessage, succeeded]);

  const resetPasswordMutation = useMutation({
    mutationFn: (values: ResetPasswordFormValues) =>
      resetPassword({ token: token!, newPassword: values.newPassword, confirmPassword: values.confirmPassword }),
    onSuccess: () => {
      setErrorMessage(null);
      setSucceeded(true);
      // Deliberately does NOT log the user in - the backend's own
      // resetPassword() never issues tokens either (US-007 section 2).
      // The explicit link below covers users who navigate away from this
      // tab before the automatic redirect fires.
      const timer = setTimeout(() => navigate("/iniciar-sesion", { replace: true }), REDIRECT_DELAY_MS);
      return () => clearTimeout(timer);
    },
    onError: (error) => {
      setErrorMessage(getResetPasswordErrorMessage(error).message);
    },
  });

  const onSubmit = handleSubmit(
    (values) => {
      if (resetPasswordMutation.isPending) return;
      resetPasswordMutation.mutate(values);
    },
    () => {
      const firstErrorField = errors.newPassword ? "newPassword" : errors.confirmPassword ? "confirmPassword" : null;
      if (firstErrorField) setFocus(firstErrorField);
    },
  );

  if (!token) {
    return (
      <EmptyState
        icon={<AlertTriangle className="h-10 w-10" />}
        title="Enlace inválido"
        description="Este enlace de recuperación no es válido o ya expiró. Solicita uno nuevo para continuar."
        action={
          <Link
            to="/recuperar-clave"
            className="inline-flex h-11 items-center justify-center rounded-full bg-brand-dark px-5 text-sm font-medium text-white transition-colors hover:bg-brand-orange focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-dark focus-visible:ring-offset-2"
          >
            Solicitar nuevo enlace
          </Link>
        }
      />
    );
  }

  const isBusy = isSubmitting || resetPasswordMutation.isPending;

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-brand-dark">Restablecer clave</h1>
      <p className="mt-1 text-sm text-text-muted">Elige una nueva contraseña para tu cuenta.</p>

      {(errorMessage || succeeded) && (
        <div ref={messageRef} tabIndex={-1} className="mt-4 focus:outline-none">
          <Alert variant={succeeded ? "success" : "danger"}>
            {succeeded
              ? "Tu contraseña ha sido restablecida correctamente. Redirigiendo al inicio de sesión…"
              : errorMessage}
          </Alert>
        </div>
      )}

      {!succeeded && (
        <form onSubmit={onSubmit} noValidate className="mt-6 flex flex-col gap-4">
          <FormField
            label="Nueva contraseña"
            error={errors.newPassword?.message}
            hint={`Debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`}
            required
          >
            {(controlProps) => (
              <PasswordInput {...controlProps} autoComplete="new-password" {...register("newPassword")} />
            )}
          </FormField>

          <FormField label="Confirmar contraseña" error={errors.confirmPassword?.message} required>
            {(controlProps) => (
              <PasswordInput {...controlProps} autoComplete="new-password" {...register("confirmPassword")} />
            )}
          </FormField>

          <Button type="submit" loading={isBusy} disabled={isBusy} className="mt-2">
            Restablecer contraseña
          </Button>
        </form>
      )}

      {succeeded && (
        <p className="mt-6 text-center text-sm text-text-muted">
          <Link to="/iniciar-sesion" className="font-medium text-brand-dark hover:underline">
            Ir a iniciar sesión ahora
          </Link>
        </p>
      )}
    </div>
  );
}
