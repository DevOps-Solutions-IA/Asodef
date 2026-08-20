import { useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, ErrorState, FormField, Input, PageHeader, Skeleton, Textarea } from "@asodef/ui";
import { getUserDetail, updateUser } from "../../lib/admin/admin-users-api";
import { getAdminErrorMessage } from "../../lib/admin/admin-error-messages";
import { queryKeys } from "../../lib/query-keys";
import { UserDetailTabs } from "./UserDetailTabs";
import { isStepUpCancelledError, useStepUpAction } from "../../lib/auth/use-step-up-action";

const editUserSchema = z.object({
  email: z.string().trim().toLowerCase().min(1, "El correo electrónico es requerido.").email("Ingresa un correo electrónico válido."),
  fullName: z.string().trim().min(1, "El nombre completo es requerido."),
  reason: z.string().trim().min(1, "Debes indicar un motivo para este cambio."),
});

type EditUserFormValues = z.infer<typeof editUserSchema>;

export function EditUserPage() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const errorRef = useRef<HTMLDivElement>(null);
  const stepUp = useStepUpAction();

  const detailQuery = useQuery({
    queryKey: queryKeys.admin.users.detail(userId!),
    queryFn: ({ signal }) => getUserDetail(userId!, signal),
    enabled: !!userId,
  });

  const {
    register,
    handleSubmit,
    reset,
    setFocus,
    formState: { errors },
  } = useForm<EditUserFormValues>({ resolver: zodResolver(editUserSchema) });

  useEffect(() => {
    if (detailQuery.data) {
      reset({ email: detailQuery.data.email, fullName: detailQuery.data.fullName, reason: "" });
    }
  }, [detailQuery.data, reset]);

  const mutation = useMutation({
    mutationFn: (values: EditUserFormValues) => {
      const input = { ...values, expectedUpdatedAt: detailQuery.data?.updatedAt };
      return stepUp.execute(() => updateUser(userId!, input));
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.users.detail(userId!) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.users.allLists() });
      navigate(`/admin/usuarios/${userId}`);
    },
  });

  useEffect(() => {
    if (mutation.isError) errorRef.current?.focus();
  }, [mutation.isError]);

  const onSubmit = handleSubmit(
    (values) => {
      if (mutation.isPending) return;
      mutation.mutate(values);
    },
    () => {
      const firstErrorField = errors.email ? "email" : errors.fullName ? "fullName" : errors.reason ? "reason" : null;
      if (firstErrorField) setFocus(firstErrorField);
    },
  );

  if (detailQuery.isLoading) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        <span className="sr-only" role="status">
          Cargando usuario…
        </span>
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full max-w-2xl" />
      </div>
    );
  }

  if (detailQuery.isError || !detailQuery.data) {
    return <ErrorState description={getAdminErrorMessage(detailQuery.error)} action={<Button onClick={() => detailQuery.refetch()}>Reintentar</Button>} />;
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <PageHeader title="Editar usuario" description={detailQuery.data.email} />
      <UserDetailTabs userId={detailQuery.data.id} />

      {mutation.isError && !isStepUpCancelledError(mutation.error) && (
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

        <FormField label="Motivo del cambio" error={errors.reason?.message} required>
          {(controlProps) => <Textarea {...controlProps} rows={3} {...register("reason")} />}
        </FormField>

        <div className="mt-2 flex gap-3">
          <Button type="submit" loading={mutation.isPending} disabled={mutation.isPending}>
            Guardar cambios
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate(`/admin/usuarios/${userId}`)}>
            Cancelar
          </Button>
        </div>
      </form>
      {stepUp.dialog}
    </div>
  );
}
