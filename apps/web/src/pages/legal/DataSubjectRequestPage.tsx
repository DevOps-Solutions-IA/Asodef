import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Alert, Button, Card, FormField, Input, Select, StatusBadge, Textarea } from "@asodef/ui";
import { ApiError } from "../../lib/api-error";
import { lookupDataSubjectRequest, submitDataSubjectRequest } from "../../lib/data-subject-requests/data-subject-requests-api";
import {
  DATA_SUBJECT_REQUEST_STATUS_LABELS,
  DATA_SUBJECT_REQUEST_TYPES,
  DATA_SUBJECT_REQUEST_TYPE_LABELS,
} from "../../lib/data-subject-requests/data-subject-requests-types";

const requestSchema = z.object({
  type: z.enum(DATA_SUBJECT_REQUEST_TYPES, { errorMap: () => ({ message: "Selecciona el tipo de solicitud." }) }),
  requesterName: z.string().min(1, "El nombre completo es requerido."),
  requesterEmail: z.string().min(1, "El correo electrónico es requerido.").email("Ingresa un correo electrónico válido."),
  requesterDocument: z.string().min(1, "El número de documento es requerido."),
  description: z.string().min(1, "La descripción de la solicitud es requerida."),
});

type RequestFormValues = z.infer<typeof requestSchema>;

function statusTone(status: string): "pending" | "success" | "rejected" | "under_review" {
  if (status === "RESOLVED" || status === "CLOSED") return "success";
  if (status === "REJECTED_WITH_REASON") return "rejected";
  if (status === "IN_REVIEW" || status === "IDENTITY_VERIFICATION") return "under_review";
  return "pending";
}

/**
 * US-048: replaces the "aún no publicado" placeholder previously shown
 * at this route (US-045 correctly left it that way, since this
 * submission workflow - not a LegalDocument - was always this story's
 * own territory). Two independent flows on one page: submit a new
 * request, or look up an existing one by its tracking reference.
 */
export function DataSubjectRequestPage() {
  const [trackingReference, setTrackingReference] = useState<string | null>(null);
  const [lookupInput, setLookupInput] = useState("");
  const [lookupReference, setLookupReference] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<RequestFormValues>({ resolver: zodResolver(requestSchema) });

  const submitMutation = useMutation({
    mutationFn: submitDataSubjectRequest,
    onSuccess: (result) => {
      setTrackingReference(result.publicReference);
      reset();
    },
  });

  const onSubmit = handleSubmit((values) => {
    if (submitMutation.isPending) return;
    submitMutation.mutate(values);
  });

  const lookupQuery = useQuery({
    queryKey: ["data-subject-requests", "lookup", lookupReference],
    queryFn: () => lookupDataSubjectRequest(lookupReference!),
    enabled: Boolean(lookupReference),
    retry: false,
  });

  const isBusy = isSubmitting || submitMutation.isPending;

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-brand-dark">Solicitudes de datos</h1>
      <p className="mt-1 text-sm text-text-muted">
        Ejerce tus derechos sobre tus datos personales (acceso, corrección, eliminación, revocatoria y más). Recibirás
        una referencia de seguimiento al enviar tu solicitud.
      </p>

      <Card className="mt-6">
        <h2 className="font-display text-lg font-semibold text-text-main">Nueva solicitud</h2>

        {trackingReference && (
          <Alert variant="success" className="mt-4">
            Tu solicitud fue registrada. Guarda tu referencia de seguimiento: <strong>{trackingReference}</strong>
          </Alert>
        )}
        {submitMutation.isError && (
          <Alert variant="danger" className="mt-4">
            {submitMutation.error instanceof ApiError ? submitMutation.error.message : "Ocurrió un problema inesperado. Intenta nuevamente."}
          </Alert>
        )}

        <form onSubmit={onSubmit} noValidate className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Tipo de solicitud" error={errors.type?.message} required className="sm:col-span-2">
            {(controlProps) => (
              <Select {...controlProps} defaultValue="" {...register("type")}>
                <option value="" disabled>
                  Selecciona un tipo
                </option>
                {DATA_SUBJECT_REQUEST_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {DATA_SUBJECT_REQUEST_TYPE_LABELS[type]}
                  </option>
                ))}
              </Select>
            )}
          </FormField>

          <FormField label="Nombre completo" error={errors.requesterName?.message} required>
            {(controlProps) => <Input {...controlProps} autoComplete="name" {...register("requesterName")} />}
          </FormField>

          <FormField label="Número de documento" error={errors.requesterDocument?.message} required>
            {(controlProps) => <Input {...controlProps} autoComplete="off" {...register("requesterDocument")} />}
          </FormField>

          <FormField label="Correo electrónico" error={errors.requesterEmail?.message} required className="sm:col-span-2">
            {(controlProps) => <Input {...controlProps} type="email" autoComplete="email" {...register("requesterEmail")} />}
          </FormField>

          <FormField label="Describe tu solicitud" error={errors.description?.message} required className="sm:col-span-2">
            {(controlProps) => <Textarea {...controlProps} rows={4} {...register("description")} />}
          </FormField>

          <Button type="submit" loading={isBusy} disabled={isBusy} className="sm:col-span-2">
            Enviar solicitud
          </Button>
        </form>
      </Card>

      <Card className="mt-6">
        <h2 className="font-display text-lg font-semibold text-text-main">Consultar el estado de una solicitud</h2>
        <p className="mt-1 text-sm text-text-muted">Ingresa la referencia de seguimiento que recibiste al enviar tu solicitud.</p>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            setLookupReference(lookupInput.trim() || null);
          }}
          className="mt-4 flex flex-col gap-3 sm:flex-row"
        >
          <Input
            aria-label="Referencia de seguimiento"
            placeholder="Referencia de seguimiento"
            value={lookupInput}
            onChange={(event) => setLookupInput(event.target.value)}
          />
          <Button type="submit" disabled={!lookupInput.trim()}>
            Consultar
          </Button>
        </form>

        {lookupQuery.isPending && lookupReference && <p className="mt-4 text-sm text-text-muted">Buscando...</p>}

        {lookupQuery.isError && (
          <Alert variant="danger" className="mt-4">
            No encontramos una solicitud con esa referencia. Verifica el dato e intenta nuevamente.
          </Alert>
        )}

        {lookupQuery.data && (
          <div className="mt-4 rounded-2xl border border-border-soft p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="font-medium text-text-main">{DATA_SUBJECT_REQUEST_TYPE_LABELS[lookupQuery.data.type as never] ?? lookupQuery.data.type}</p>
              <StatusBadge
                tone={statusTone(lookupQuery.data.status)}
                label={DATA_SUBJECT_REQUEST_STATUS_LABELS[lookupQuery.data.status] ?? lookupQuery.data.status}
              />
            </div>
            <p className="mt-2 text-sm text-text-muted">{lookupQuery.data.description}</p>
            {lookupQuery.data.resolution && (
              <p className="mt-2 text-sm text-text-main">
                <span className="font-medium">Resolución:</span> {lookupQuery.data.resolution}
              </p>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
