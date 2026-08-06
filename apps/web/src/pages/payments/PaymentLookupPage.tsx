import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { FileSearch, LockKeyhole, ReceiptText, ShieldCheck } from "lucide-react";
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
      <div className="grid overflow-hidden rounded-[2rem] border border-border-subtle bg-brand-deep shadow-e4 lg:grid-cols-[0.9fr_1.1fr]">
        <section className="relative flex flex-col justify-between overflow-hidden p-7 text-white sm:p-9 lg:p-11">
          <div aria-hidden="true" className="absolute -right-20 -top-20 h-64 w-64 rounded-full border border-white/10 bg-brand-orange/10" />
          <div className="relative">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-white/80">
              <ShieldCheck aria-hidden="true" className="h-4 w-4 text-brand-light" /> Gestión segura
            </span>
            <h1 className="mt-6 max-w-md font-display text-3xl font-semibold leading-tight text-white sm:text-4xl">Centro de Pagos</h1>
            <p className="mt-4 max-w-md text-sm leading-6 text-white/70 sm:text-base">
              Consulta tus obligaciones pendientes por documento o retoma un pago con tu número de referencia.
            </p>
          </div>
          <ul className="relative mt-9 grid gap-3 text-sm text-white/80">
            <li className="flex items-center gap-3"><LockKeyhole aria-hidden="true" className="h-4 w-4 text-brand-light" /> Datos transmitidos por canales protegidos</li>
            <li className="flex items-center gap-3"><ReceiptText aria-hidden="true" className="h-4 w-4 text-brand-light" /> Trazabilidad por referencia y comprobante</li>
            <li className="flex items-center gap-3"><FileSearch aria-hidden="true" className="h-4 w-4 text-brand-light" /> Consulta directa, clara y verificable</li>
          </ul>
        </section>

        <section className="bg-white p-6 sm:p-9 lg:p-11">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-orange">Consulta de obligaciones</p>
          <h2 className="mt-2 font-display text-2xl font-semibold text-brand-dark">Encuentra tu información de pago</h2>
          <p className="mt-2 text-sm leading-6 text-text-muted">Selecciona el dato que tienes disponible para continuar.</p>
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          <fieldset className="mt-6 flex flex-col gap-3 rounded-2xl border border-border-soft bg-bg-soft p-4 sm:flex-row sm:gap-6">
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

          <div className="pt-2">
            <Button type="submit" loading={isBusy} disabled={isBusy} className="w-full sm:w-auto">
              Buscar
            </Button>
          </div>
        </form>
        </section>
      </div>

      {notFound && (
        <EmptyState
          className="mt-6"
          title="No se encontraron resultados"
          description="Verifica los datos ingresados e intenta nuevamente."
        />
      )}

      {result?.type === "customer" && (
        <Card className="mt-8" variant="accent">
          <p className="text-sm text-text-muted">Resultados para</p>
          <p className="font-display text-lg font-semibold text-text-main">{result.customer.fullName}</p>
          <p className="text-sm text-text-muted">
            {result.customer.documentType} {result.customer.maskedDocumentNumber}
          </p>

          <ul className="mt-6 flex flex-col gap-3">
            {result.obligations.map((obligation) => (
              <li
                key={obligation.obligationId}
                className="flex flex-col gap-3 rounded-2xl border border-border-soft bg-white p-4 shadow-e1 transition-all duration-enterprise hover:-translate-y-0.5 hover:border-border-strong hover:shadow-e2 sm:flex-row sm:items-center sm:justify-between"
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
