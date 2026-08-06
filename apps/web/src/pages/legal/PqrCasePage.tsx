import { useState } from "react";
import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Alert, Badge, Button, Card, Checkbox, FormField, Input, Select, StatusBadge, Textarea } from "@asodef/ui";
import { ApiError } from "../../lib/api-error";
import { lookupPqrCase, submitPqrCase } from "../../lib/pqr-cases/pqr-cases-api";
import { PQR_BASE_CATEGORIES, PQR_CATEGORY_LABELS, PQR_STATUS_LABELS } from "../../lib/pqr-cases/pqr-cases-types";
import { getPublicLegalDocument } from "../../lib/legal/legal-api";
import { queryKeys } from "../../lib/query-keys";

const caseSchema = z.object({
  category: z.enum(PQR_BASE_CATEGORIES, { errorMap: () => ({ message: "Selecciona una categoría." }) }),
  applicantName: z.string().min(1, "El nombre completo es requerido."),
  applicantContact: z.string().min(1, "El contacto (correo o teléfono) es requerido."),
  description: z.string().min(1, "La descripción es requerida."),
  paymentReference: z.string().optional(),
  dataProcessingAccepted: z.literal(true, { errorMap: () => ({ message: "Debes aceptar el tratamiento de datos para continuar." }) }),
});

type CaseFormValues = z.infer<typeof caseSchema>;

function statusTone(status: string): "pending" | "success" | "rejected" | "under_review" {
  if (status === "RESOLVED" || status === "CLOSED") return "success";
  if (status === "IN_REVIEW" || status === "ASSIGNED" || status === "REOPENED") return "under_review";
  return "pending";
}

/**
 * US-050: /legal/pqr's real submission form + case-number lookup - same
 * dual-purpose design as DataSubjectRequestPage (US-048). Replaces the
 * generic LegalDocumentPage rendering for this one route (router.tsx),
 * same special-casing pattern as solicitudes-de-datos.
 */
export function PqrCasePage() {
  const [trackingNumber, setTrackingNumber] = useState<string | null>(null);
  const [lookupInput, setLookupInput] = useState("");
  const [lookupCaseNumber, setLookupCaseNumber] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CaseFormValues>({ resolver: zodResolver(caseSchema) });

  const submitMutation = useMutation({
    mutationFn: submitPqrCase,
    onSuccess: (result) => {
      setTrackingNumber(result.caseNumber);
      reset();
    },
  });

  const policyQuery = useQuery({ queryKey: queryKeys.legalDocuments.detail("pqr"), queryFn: () => getPublicLegalDocument("pqr"), retry: false });

  const onSubmit = handleSubmit(({ dataProcessingAccepted: _accepted, ...values }) => {
    if (submitMutation.isPending) return;
    submitMutation.mutate(values);
  });

  const lookupQuery = useQuery({
    queryKey: ["pqr-cases", "lookup", lookupCaseNumber],
    queryFn: () => lookupPqrCase(lookupCaseNumber!),
    enabled: Boolean(lookupCaseNumber),
    retry: false,
  });

  const isBusy = isSubmitting || submitMutation.isPending;

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-brand-dark">PQR</h1>
      <p className="mt-1 text-sm text-text-muted">
        Radica una petición, queja, reclamo o sugerencia. Recibirás un número de caso para hacer seguimiento.
      </p>

      {policyQuery.data?.content && (
        <details className="mt-5 rounded-2xl border border-brand-dark/10 bg-brand-dark-50 p-4">
          <summary className="cursor-pointer font-display text-sm font-semibold text-brand-dark">Consultar la política PQR vigente <Badge variant="success" className="ml-2">Versión {policyQuery.data.version}</Badge></summary>
          <div className="mt-4 space-y-4">{policyQuery.data.content.sections.map((section) => <section key={section.heading}><h2 className="text-sm font-semibold text-text-main">{section.heading}</h2><p className="mt-1 text-sm leading-6 text-text-muted">{section.body}</p></section>)}</div>
        </details>
      )}

      <Card className="mt-6">
        <h2 className="font-display text-lg font-semibold text-text-main">Nuevo caso</h2>

        {trackingNumber && (
          <Alert variant="success" className="mt-4">
            Tu caso fue registrado. Guarda tu número de caso: <strong>{trackingNumber}</strong>
          </Alert>
        )}
        {submitMutation.isError && (
          <Alert variant="danger" className="mt-4">
            {submitMutation.error instanceof ApiError ? submitMutation.error.message : "Ocurrió un problema inesperado. Intenta nuevamente."}
          </Alert>
        )}

        <form onSubmit={onSubmit} noValidate className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Categoría" error={errors.category?.message} required>
            {(controlProps) => (
              <Select {...controlProps} defaultValue="" {...register("category")}>
                <option value="" disabled>
                  Selecciona una categoría
                </option>
                {PQR_BASE_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {PQR_CATEGORY_LABELS[category]}
                  </option>
                ))}
              </Select>
            )}
          </FormField>

          <FormField label="Referencia de pago (opcional)" error={errors.paymentReference?.message}>
            {(controlProps) => <Input {...controlProps} autoComplete="off" {...register("paymentReference")} />}
          </FormField>

          <FormField label="Nombre completo" error={errors.applicantName?.message} required>
            {(controlProps) => <Input {...controlProps} autoComplete="name" {...register("applicantName")} />}
          </FormField>

          <FormField label="Correo o teléfono de contacto" error={errors.applicantContact?.message} required>
            {(controlProps) => <Input {...controlProps} autoComplete="off" {...register("applicantContact")} />}
          </FormField>

          <FormField label="Describe tu caso" error={errors.description?.message} required className="sm:col-span-2">
            {(controlProps) => <Textarea {...controlProps} rows={4} {...register("description")} />}
          </FormField>

          <div className="sm:col-span-2">
            <Checkbox {...register("dataProcessingAccepted")} label={<>Acepto el tratamiento necesario para gestionar mi caso conforme a la <Link to="/legal/tratamiento-de-datos" target="_blank" className="font-medium text-brand-dark hover:underline">Política de tratamiento</Link> y al <Link to="/legal/aviso-de-privacidad" target="_blank" className="font-medium text-brand-dark hover:underline">Aviso de privacidad</Link>.</>} />
            {errors.dataProcessingAccepted && <p className="mt-1 text-sm text-danger">{errors.dataProcessingAccepted.message}</p>}
          </div>

          <Button type="submit" loading={isBusy} disabled={isBusy} className="sm:col-span-2">
            Enviar caso
          </Button>
        </form>
      </Card>

      <Card className="mt-6">
        <h2 className="font-display text-lg font-semibold text-text-main">Consultar el estado de un caso</h2>
        <p className="mt-1 text-sm text-text-muted">Ingresa el número de caso que recibiste al enviar tu PQR.</p>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            setLookupCaseNumber(lookupInput.trim() || null);
          }}
          className="mt-4 flex flex-col gap-3 sm:flex-row"
        >
          <Input
            aria-label="Número de caso"
            placeholder="Número de caso"
            value={lookupInput}
            onChange={(event) => setLookupInput(event.target.value)}
          />
          <Button type="submit" disabled={!lookupInput.trim()}>
            Consultar
          </Button>
        </form>

        {lookupQuery.isPending && lookupCaseNumber && <p className="mt-4 text-sm text-text-muted">Buscando...</p>}

        {lookupQuery.isError && (
          <Alert variant="danger" className="mt-4">
            No encontramos un caso con ese número. Verifica el dato e intenta nuevamente.
          </Alert>
        )}

        {lookupQuery.data && (
          <div className="mt-4 rounded-2xl border border-border-soft p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="font-medium text-text-main">{PQR_CATEGORY_LABELS[lookupQuery.data.category] ?? lookupQuery.data.category}</p>
              <StatusBadge tone={statusTone(lookupQuery.data.status)} label={PQR_STATUS_LABELS[lookupQuery.data.status] ?? lookupQuery.data.status} />
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
