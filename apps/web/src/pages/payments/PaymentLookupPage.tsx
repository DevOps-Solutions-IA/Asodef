import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { Alert, Button, Card, EmptyState, FormField, Input, Radio, StatusBadge } from "@asodef/ui";
import { ApiError } from "../../lib/api-error";
import { createPaymentOrder, lookupPayments } from "../../lib/payments/payments-api";
import type { PaymentsLookupResponse } from "../../lib/payments/payments-types";
import { formatCurrency } from "./format-currency";
import { getObligationStatusLabel } from "./obligation-status-labels";

/**
 * No confirmed catalog of Colombian document types exists anywhere in
 * the approved PRD (only "CC" ever appears, as an example value, never
 * as an exhaustive list) - the backend itself imposes no enum either
 * (Customer.documentType is a plain string). Rather than inventing a
 * dropdown of unconfirmed values, this stays a free-text field
 * defaulting to "CC" (the one confirmed value), matching the backend's
 * own lack of a fixed vocabulary.
 */
const lookupSchema = z
  .object({
    mode: z.enum(["document", "reference"]),
    documentType: z.string().trim().optional(),
    documentNumber: z.string().trim().optional(),
    reference: z.string().trim().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.mode === "document") {
      if (!data.documentType) {
        ctx.addIssue({ code: "custom", path: ["documentType"], message: "El tipo de documento es requerido." });
      }
      if (!data.documentNumber) {
        ctx.addIssue({ code: "custom", path: ["documentNumber"], message: "El número de documento es requerido." });
      }
    } else if (!data.reference) {
      ctx.addIssue({ code: "custom", path: ["reference"], message: "La referencia de pago es requerida." });
    }
  });

type LookupFormValues = z.infer<typeof lookupSchema>;

export function PaymentLookupPage() {
  const navigate = useNavigate();
  const [result, setResult] = useState<PaymentsLookupResponse | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<LookupFormValues>({
    resolver: zodResolver(lookupSchema),
    defaultValues: { mode: "document", documentType: "CC" },
  });

  const mode = watch("mode");

  const lookupMutation = useMutation({
    mutationFn: lookupPayments,
    onSuccess: (data) => {
      setFormError(null);
      if (data.type === "order") {
        // A reference always resolves to exactly one order - go straight
        // to its summary (US-030) rather than rendering it inline here.
        setNotFound(false);
        navigate(`/pagos/orden/${data.order.publicReference}`);
        return;
      }
      setNotFound(false);
      setResult(data);
    },
    onError: (error) => {
      setResult(null);
      if (error instanceof ApiError && error.kind === "not_found") {
        setNotFound(true);
        setFormError(null);
        return;
      }
      setNotFound(false);
      setFormError(error instanceof ApiError ? error.message : "Ocurrió un problema inesperado. Intenta nuevamente.");
    },
  });

  const createOrderMutation = useMutation({
    mutationFn: createPaymentOrder,
    onSuccess: (order) => {
      navigate(`/pagos/orden/${order.publicReference}`);
    },
    onError: (error) => {
      setFormError(error instanceof ApiError ? error.message : "Ocurrió un problema inesperado. Intenta nuevamente.");
    },
  });

  const onSubmit = handleSubmit((values) => {
    setResult(null);
    setNotFound(false);
    setFormError(null);
    if (values.mode === "document") {
      lookupMutation.mutate({ documentType: values.documentType!.trim(), documentNumber: values.documentNumber!.trim() });
    } else {
      lookupMutation.mutate({ reference: values.reference!.trim() });
    }
  });

  const isBusy = isSubmitting || lookupMutation.isPending || createOrderMutation.isPending;

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-brand-dark">Centro de Pagos</h1>
      <p className="mt-1 text-sm text-text-muted">
        Consulta tus obligaciones pendientes por documento, o retoma un pago con tu número de referencia.
      </p>

      <Card className="mt-6">
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          <fieldset className="flex flex-col gap-3 sm:flex-row sm:gap-6">
            <legend className="text-sm font-medium text-text-main">Método de búsqueda</legend>
            <Radio value="document" label="Por documento" {...register("mode")} />
            <Radio value="reference" label="Por referencia de pago" {...register("mode")} />
          </fieldset>

          {mode === "reference" ? (
            <FormField label="Referencia de pago" error={errors.reference?.message} required>
              {(controlProps) => <Input {...controlProps} autoComplete="off" {...register("reference")} />}
            </FormField>
          ) : (
            <div className="grid gap-4 sm:grid-cols-[minmax(0,140px)_1fr]">
              <FormField label="Tipo de documento" error={errors.documentType?.message} required>
                {(controlProps) => <Input {...controlProps} {...register("documentType")} />}
              </FormField>
              <FormField label="Número de documento" error={errors.documentNumber?.message} required>
                {(controlProps) => <Input {...controlProps} inputMode="numeric" autoComplete="off" {...register("documentNumber")} />}
              </FormField>
            </div>
          )}

          {formError && <Alert variant="danger">{formError}</Alert>}

          <div>
            <Button type="submit" loading={isBusy} disabled={isBusy}>
              Buscar
            </Button>
          </div>
        </form>
      </Card>

      {notFound && (
        <EmptyState
          className="mt-6"
          title="No se encontraron resultados"
          description="Verifica los datos ingresados e intenta nuevamente."
        />
      )}

      {result?.type === "customer" && (
        <Card className="mt-6">
          <p className="text-sm text-text-muted">Resultados para</p>
          <p className="font-display text-lg font-semibold text-text-main">{result.customer.fullName}</p>
          <p className="text-sm text-text-muted">
            {result.customer.documentType} {result.customer.maskedDocumentNumber}
          </p>

          <ul className="mt-6 flex flex-col gap-3">
            {result.obligations.map((obligation) => (
              <li
                key={obligation.obligationId}
                className="flex flex-col gap-3 rounded-2xl border border-border-soft bg-white p-4 shadow-e1 transition-shadow duration-150 hover:shadow-e2 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium text-text-main">{obligation.concept}</p>
                  <p className="text-sm text-text-muted">Vence: {new Date(obligation.dueDate).toLocaleDateString("es-CO")}</p>
                  <StatusBadge
                    tone={obligation.status === "OVERDUE" ? "rejected" : "pending"}
                    label={getObligationStatusLabel(obligation.status)}
                    className="mt-2"
                  />
                </div>
                <div className="flex items-center gap-4">
                  <p className="font-display text-lg font-semibold tabular-nums text-brand-dark">
                    {formatCurrency(obligation.amountCents, obligation.currency)}
                  </p>
                  <Button
                    type="button"
                    loading={createOrderMutation.isPending && createOrderMutation.variables === obligation.obligationId}
                    disabled={isBusy}
                    onClick={() => createOrderMutation.mutate(obligation.obligationId)}
                  >
                    Pagar
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
