import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { Alert, Button, FormField, Input } from "@asodef/ui";
import { forgotPassword } from "../../lib/auth/auth-api";
import { getSessionErrorMessage } from "../../lib/auth/auth-error-messages";

const GENERIC_SUCCESS_MESSAGE = "Si la cuenta existe, enviaremos las instrucciones para recuperar la contraseña.";

const forgotPasswordSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "El correo electrónico es requerido.")
    .email("Ingresa un correo electrónico válido.")
    .transform((value) => value.toLowerCase()),
});

type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>;

export function ForgotPasswordPage() {
  const messageRef = useRef<HTMLDivElement>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordFormValues>({ resolver: zodResolver(forgotPasswordSchema) });

  useEffect(() => {
    if (successMessage || errorMessage) {
      messageRef.current?.focus();
    }
  }, [successMessage, errorMessage]);

  const forgotPasswordMutation = useMutation({
    mutationFn: forgotPassword,
    onSuccess: () => {
      setErrorMessage(null);
      // Always the same fixed public message, regardless of what the
      // backend actually did internally (existing account, unknown
      // account, or silently rate-limited - US-010 section 2/US-007).
      // Never render the backend's own response body here, even though
      // it happens to already say the same thing - the constant is the
      // single source of truth on the frontend too.
      setSuccessMessage(GENERIC_SUCCESS_MESSAGE);
    },
    onError: (error) => {
      setSuccessMessage(null);
      // A real network/server failure - the request never meaningfully
      // reached the recovery flow at all, so this is a safe, honest,
      // non-enumerating message distinct from the generic success state.
      setErrorMessage(getSessionErrorMessage(error).message);
    },
  });

  const onSubmit = handleSubmit(
    (values) => {
      if (forgotPasswordMutation.isPending) return;
      forgotPasswordMutation.mutate(values);
    },
    () => {
      if (errors.email) setFocus("email");
    },
  );

  const isBusy = isSubmitting || forgotPasswordMutation.isPending;

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-brand-dark">Recuperar clave</h1>
      <p className="mt-1 text-sm text-text-muted">
        Ingresa tu correo electrónico y te enviaremos instrucciones para restablecer tu contraseña.
      </p>

      {(successMessage || errorMessage) && (
        <div ref={messageRef} tabIndex={-1} className="mt-4 focus:outline-none">
          <Alert variant={successMessage ? "success" : "danger"}>{successMessage ?? errorMessage}</Alert>
        </div>
      )}

      {!successMessage && (
        <form onSubmit={onSubmit} noValidate className="mt-6 flex flex-col gap-4">
          <FormField label="Correo electrónico" error={errors.email?.message} required>
            {(controlProps) => (
              <Input {...controlProps} type="email" autoComplete="email" {...register("email")} />
            )}
          </FormField>

          <Button type="submit" loading={isBusy} disabled={isBusy} className="mt-2">
            Enviar instrucciones
          </Button>
        </form>
      )}

      {successMessage && (
        <Button
          type="button"
          variant="outline"
          className="mt-6"
          onClick={() => {
            setSuccessMessage(null);
          }}
        >
          Enviar de nuevo
        </Button>
      )}

      <p className="mt-6 text-center text-sm text-text-muted">
        <Link to="/iniciar-sesion" className="font-medium text-brand-dark hover:underline">
          Volver a iniciar sesión
        </Link>
      </p>
    </div>
  );
}
