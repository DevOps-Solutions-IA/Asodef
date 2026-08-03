import { useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Checkbox, FormField, Input, PageHeader } from "@asodef/ui";
import { createUser } from "../../lib/admin/admin-users-api";
import { getAdminErrorMessage } from "../../lib/admin/admin-error-messages";
import { queryKeys } from "../../lib/query-keys";
import { useAuth } from "../../lib/auth/auth-context";

const ASSIGNABLE_ROLES = [
  "SUPER_ADMIN",
  "ADMIN",
  "FINANCE",
  "COMMERCIAL",
  "CUSTOMER_SERVICE",
  "COMPANY_PARTNER",
  "AFFILIATE",
  "CUSTOMER",
  "AUDITOR",
] as const;

const createUserSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "El correo electrónico es requerido.")
    .email("Ingresa un correo electrónico válido."),
  fullName: z.string().trim().min(1, "El nombre completo es requerido."),
  roles: z.array(z.string()).optional(),
});

type CreateUserFormValues = z.infer<typeof createUserSchema>;

export function CreateUserPage() {
  const { hasRole } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const errorRef = useRef<HTMLDivElement>(null);
  const canAssignRoles = hasRole("SUPER_ADMIN");

  const {
    register,
    handleSubmit,
    setFocus,
    formState: { errors },
  } = useForm<CreateUserFormValues>({ resolver: zodResolver(createUserSchema), defaultValues: { roles: [] } });

  const mutation = useMutation({
    mutationFn: (values: CreateUserFormValues) => createUser(values),
    onSuccess: (user) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.users.allLists() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.users.stats() });
      navigate(`/admin/usuarios/${user.id}`, { replace: true });
    },
  });

  useEffect(() => {
    if (mutation.isError) {
      errorRef.current?.focus();
    }
  }, [mutation.isError]);

  const onSubmit = handleSubmit(
    (values) => {
      if (mutation.isPending) return;
      mutation.mutate(values);
    },
    () => {
      const firstErrorField = errors.email ? "email" : errors.fullName ? "fullName" : null;
      if (firstErrorField) setFocus(firstErrorField);
    },
  );

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <PageHeader title="Nuevo usuario" description="Se enviará un correo de invitación para configurar la contraseña." />

      {mutation.isError && (
        <div ref={errorRef} tabIndex={-1} className="focus:outline-none">
          <Alert variant="danger">{getAdminErrorMessage(mutation.error)}</Alert>
        </div>
      )}

      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <FormField label="Correo electrónico" error={errors.email?.message} required>
          {(controlProps) => <Input {...controlProps} type="email" autoComplete="email" {...register("email")} />}
        </FormField>

        <FormField label="Nombre completo" error={errors.fullName?.message} required>
          {(controlProps) => <Input {...controlProps} type="text" autoComplete="name" {...register("fullName")} />}
        </FormField>

        {canAssignRoles ? (
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium text-text-main">Roles iniciales (opcional)</legend>
            <div className="flex flex-col gap-2 rounded-2xl border border-border-soft p-4">
              {ASSIGNABLE_ROLES.map((roleName) => (
                <Checkbox key={roleName} value={roleName} label={roleName} {...register("roles")} />
              ))}
            </div>
          </fieldset>
        ) : (
          <p className="rounded-2xl bg-bg-soft px-4 py-3 text-sm text-text-muted">
            Solo un SUPER_ADMIN puede asignar roles al crear un usuario. Un SUPER_ADMIN podrá asignarlos después desde la
            sección de roles.
          </p>
        )}

        <div className="mt-2 flex gap-3">
          <Button type="submit" loading={mutation.isPending} disabled={mutation.isPending}>
            Crear usuario
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate("/admin/usuarios")}>
            Cancelar
          </Button>
        </div>
      </form>
    </div>
  );
}
