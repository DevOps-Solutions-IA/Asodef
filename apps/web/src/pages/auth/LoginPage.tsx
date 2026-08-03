import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { Alert, Button, FormField, Input, PasswordInput } from "@asodef/ui";
import { ApiError } from "../../lib/api-error";
import { login } from "../../lib/auth/auth-api";
import { useAuth } from "../../lib/auth/auth-context";
import { resolveLandingPath } from "../../lib/auth/role-routing";
import { isSafeInternalPath } from "../../lib/auth/safe-redirect";
import { getLoginErrorMessage } from "../../lib/auth/auth-error-messages";

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

interface LocationState {
  from?: unknown;
}

export function LoginPage() {
  const { notifyLoggedIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const errorRef = useRef<HTMLDivElement>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [rateLimitedUntil, setRateLimitedUntil] = useState<number | null>(null);
  const [isRateLimited, setIsRateLimited] = useState(false);

  const {
    register,
    handleSubmit,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({ resolver: zodResolver(loginSchema) });

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

  const loginMutation = useMutation({
    mutationFn: login,
    onSuccess: async () => {
      const currentUser = await notifyLoggedIn();
      const roles = currentUser?.roles ?? [];
      const fromState = (location.state as LocationState | null)?.from;
      // Only ever navigate to a validated internal path - never trust
      // location.state blindly, even though it is not URL-exposed
      // (US-010: "reject unsafe external redirect targets").
      const target = isSafeInternalPath(fromState) ? fromState : resolveLandingPath(roles);
      navigate(target, { replace: true });
    },
    onError: (error) => {
      const { message } = getLoginErrorMessage(error);
      setFormError(message);
      if (error instanceof ApiError && error.kind === "rate_limited" && error.retryAfterSeconds) {
        setRateLimitedUntil(Date.now() + error.retryAfterSeconds * 1000);
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

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-brand-dark">Iniciar sesión</h1>
      <p className="mt-1 text-sm text-text-muted">Ingresa tus credenciales para continuar.</p>

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
          <Link to="/recuperar-clave" className="text-sm font-medium text-brand-dark hover:underline">
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
