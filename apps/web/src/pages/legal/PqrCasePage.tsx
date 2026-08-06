import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Alert, Badge, Button, Card, Checkbox, FormField, Input, StatusBadge, Textarea } from "@asodef/ui";
import {
  ChoiceGrid,
  CompactStatusTimeline,
  ConfirmationPanel,
  FlowActions,
  ProgressiveStepShell,
  TransactionalTaskSwitcher,
  type TransactionalMode,
} from "../../components/transactional-public/TransactionalFlow";
import { ApiError } from "../../lib/api-error";
import { lookupPqrCase, submitPqrCase } from "../../lib/pqr-cases/pqr-cases-api";
import { PQR_BASE_CATEGORIES, PQR_CATEGORY_LABELS, PQR_STATUS_LABELS } from "../../lib/pqr-cases/pqr-cases-types";
import { getPublicLegalDocument } from "../../lib/legal/legal-api";
import { queryKeys } from "../../lib/query-keys";

const STORAGE_KEY = "asodef:pqr-public-flow:v1";
const TOTAL_STEPS = 5;

const caseSchema = z.object({
  category: z.enum(PQR_BASE_CATEGORIES, { errorMap: () => ({ message: "Selecciona una categoría." }) }),
  applicantName: z.string().min(1, "El nombre completo es requerido."),
  applicantContact: z.string().min(1, "El contacto (correo o teléfono) es requerido."),
  description: z.string().min(1, "La descripción es requerida."),
  paymentReference: z.string().optional(),
  dataProcessingAccepted: z.literal(true, { errorMap: () => ({ message: "Debes aceptar el tratamiento de datos para continuar." }) }),
});

type CaseFormValues = z.infer<typeof caseSchema>;

interface RecoveredPqrState {
  mode: TransactionalMode | null;
  step: number;
  category?: (typeof PQR_BASE_CATEGORIES)[number];
  values: Partial<CaseFormValues>;
}

const categoryOptions = PQR_BASE_CATEGORIES.map((value) => ({
  value,
  label: PQR_CATEGORY_LABELS[value] ?? value,
  description: {
    peticion: "Solicitar información o una actuación concreta.",
    queja: "Informar una inconformidad con la atención recibida.",
    reclamo: "Solicitar la revisión de un servicio, gestión o cobro.",
    sugerencia: "Proponer una mejora en la atención o los procesos.",
  }[value],
}));

function loadRecoveredState(): RecoveredPqrState {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "{}") as Partial<RecoveredPqrState>;
    const category = PQR_BASE_CATEGORIES.find((value) => value === parsed.category);
    const rawValues = parsed.values && typeof parsed.values === "object" ? parsed.values as Partial<CaseFormValues> : {};
    const values: Partial<CaseFormValues> = {
      category,
      applicantName: typeof rawValues.applicantName === "string" ? rawValues.applicantName : "",
      applicantContact: typeof rawValues.applicantContact === "string" ? rawValues.applicantContact : "",
      description: typeof rawValues.description === "string" ? rawValues.description : "",
      paymentReference: typeof rawValues.paymentReference === "string" ? rawValues.paymentReference : "",
      dataProcessingAccepted: rawValues.dataProcessingAccepted === true ? true : undefined,
    };
    const requestedStep = Number.isInteger(parsed.step) ? Math.min(Math.max(parsed.step ?? 0, 0), TOTAL_STEPS - 2) : 0;
    const recoverableStep = !category ? 0 : !values.description ? 1 : !values.applicantName || !values.applicantContact ? 2 : requestedStep;
    return {
      mode: parsed.mode === "create" || parsed.mode === "track" ? parsed.mode : null,
      step: Math.min(requestedStep, recoverableStep),
      category,
      values,
    };
  } catch {
    return { mode: null, step: 0, values: {} };
  }
}

function statusTone(status: string): "pending" | "success" | "rejected" | "under_review" {
  if (status === "RESOLVED" || status === "CLOSED") return "success";
  if (status === "IN_REVIEW" || status === "ASSIGNED" || status === "REOPENED") return "under_review";
  return "pending";
}

export function PqrCasePage() {
  const [searchParams] = useSearchParams();
  const requestedMode = searchParams.get("accion") === "consultar" ? "track" : searchParams.get("accion") === "radicar" ? "create" : null;
  const [recovered] = useState(loadRecoveredState);
  const [mode, setMode] = useState<TransactionalMode | null>(requestedMode ?? recovered.mode);
  const [step, setStep] = useState(recovered.step);
  const [trackingNumber, setTrackingNumber] = useState<string | null>(null);
  const [lookupInput, setLookupInput] = useState("");
  const [lookupCaseNumber, setLookupCaseNumber] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    getValues,
    setValue,
    trigger,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CaseFormValues>({
    resolver: zodResolver(caseSchema),
    defaultValues: { category: recovered.category, paymentReference: "", applicantName: "", applicantContact: "", description: "", ...recovered.values },
  });
  const formValues = watch();
  const category = formValues.category;

  useEffect(() => {
    if (requestedMode) {
      setMode(requestedMode);
      setStep(0);
    }
  }, [requestedMode]);

  useEffect(() => {
    if (trackingNumber) {
      sessionStorage.removeItem(STORAGE_KEY);
    } else if (mode || step > 0 || Object.values(formValues).some(Boolean)) {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ mode, step, category, values: formValues }));
    } else {
      sessionStorage.removeItem(STORAGE_KEY);
    }
  }, [category, formValues, mode, step, trackingNumber]);

  const submitMutation = useMutation({
    mutationFn: submitPqrCase,
    onSuccess: (result) => {
      setTrackingNumber(result.caseNumber);
      sessionStorage.removeItem(STORAGE_KEY);
      reset();
    },
  });

  const policyQuery = useQuery({
    queryKey: queryKeys.legalDocuments.detail("pqr"),
    queryFn: () => getPublicLegalDocument("pqr"),
    retry: false,
  });

  const onSubmit = handleSubmit(({ dataProcessingAccepted: _accepted, ...values }) => {
    if (!submitMutation.isPending) submitMutation.mutate(values);
  });

  const lookupQuery = useQuery({
    queryKey: ["pqr-cases", "lookup", lookupCaseNumber],
    queryFn: () => lookupPqrCase(lookupCaseNumber!),
    enabled: Boolean(lookupCaseNumber),
    retry: false,
  });

  async function advance() {
    const fields: (keyof CaseFormValues)[][] = [
      ["category"],
      ["description", "paymentReference"],
      ["applicantName", "applicantContact"],
      ["dataProcessingAccepted"],
    ];
    if (await trigger(fields[step])) {
      if (step < TOTAL_STEPS - 2) setStep((current) => current + 1);
      else void onSubmit();
    }
  }

  function chooseMode(nextMode: TransactionalMode) {
    setMode(nextMode);
    setStep(0);
    setTrackingNumber(null);
  }

  function restart() {
    reset();
    setTrackingNumber(null);
    setStep(0);
    setMode(null);
    sessionStorage.removeItem(STORAGE_KEY);
  }

  const isBusy = isSubmitting || submitMutation.isPending;

  return (
    <section className="bg-[radial-gradient(circle_at_85%_0%,rgba(128,174,58,.13),transparent_28rem)] py-10 sm:py-14 lg:py-16">
      <div className="mx-auto max-w-5xl px-5 sm:px-8">
        <p className="text-xs font-bold uppercase tracking-[.18em] text-brand-dark">Peticiones, quejas, reclamos y sugerencias</p>
        <h1 className="mt-3 max-w-3xl font-display text-3xl font-semibold tracking-[-.035em] text-text-main sm:text-5xl">Radica o consulta una PQR</h1>
        <p className="mt-4 max-w-2xl leading-7 text-text-muted">Registra una petición, queja, reclamo o sugerencia y conserva el número para consultar su estado.</p>

        <Card className="mt-7 rounded-[1.75rem] p-4 sm:p-6">
          <TransactionalTaskSwitcher mode={mode} createLabel="Radicar una PQR" trackLabel="Consultar un caso" onChange={chooseMode} />
        </Card>

        {!mode && (
          <p className="mt-6 rounded-2xl border border-brand-dark/10 bg-white p-5 text-sm leading-6 text-text-muted">Elige si quieres registrar un caso nuevo o consultar uno existente.</p>
        )}

        {mode === "create" && (
          <Card className="mt-6 rounded-[1.75rem] p-5 sm:p-8">
            {trackingNumber ? (
              <ProgressiveStepShell step={4} total={TOTAL_STEPS} title="PQR registrada" description="El caso quedó radicado y ya puedes consultar su estado.">
                <ConfirmationPanel
                  title=""
                  reference={trackingNumber}
                  referenceLabel="Número de caso"
                  restartLabel="Radicar otra PQR"
                  onTrack={() => {
                    setLookupInput(trackingNumber);
                    setLookupCaseNumber(trackingNumber);
                    setTrackingNumber(null);
                    setMode("track");
                  }}
                  onRestart={restart}
                >
                  Guarda este número. Puedes copiarlo, imprimir la confirmación o consultar el estado ahora.
                </ConfirmationPanel>
              </ProgressiveStepShell>
            ) : (
              <form onSubmit={onSubmit} noValidate>
                {step === 0 && (
                  <ProgressiveStepShell step={step} total={TOTAL_STEPS} title="¿Qué tipo de caso quieres registrar?" description="Selecciona la categoría que representa mejor tu solicitud.">
                    <ChoiceGrid
                      label="Categoría de PQR"
                      value={category}
                      options={categoryOptions}
                      onChange={(value) => setValue("category", value as CaseFormValues["category"], { shouldValidate: true })}
                    />
                    {errors.category && <p role="alert" className="mt-3 text-sm text-danger">{errors.category.message}</p>}
                  </ProgressiveStepShell>
                )}
                {step === 1 && (
                  <ProgressiveStepShell step={step} total={TOTAL_STEPS} title="Describe lo ocurrido" description="Incluye la información necesaria para revisar el caso. La referencia de pago es opcional.">
                    <div className="grid gap-4">
                      <FormField label="Descripción del caso" error={errors.description?.message} required>
                        {(controlProps) => <Textarea {...controlProps} rows={5} {...register("description")} />}
                      </FormField>
                      <FormField label="Referencia de pago (opcional)" error={errors.paymentReference?.message}>
                        {(controlProps) => <Input {...controlProps} autoComplete="off" {...register("paymentReference")} />}
                      </FormField>
                    </div>
                  </ProgressiveStepShell>
                )}
                {step === 2 && (
                  <ProgressiveStepShell step={step} total={TOTAL_STEPS} title="¿Cómo podemos identificarte y responder?" description="Registra un nombre y un correo o teléfono de contacto.">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <FormField label="Nombre completo" error={errors.applicantName?.message} required>
                        {(controlProps) => <Input {...controlProps} autoComplete="name" {...register("applicantName")} />}
                      </FormField>
                      <FormField label="Correo o teléfono de contacto" error={errors.applicantContact?.message} required>
                        {(controlProps) => <Input {...controlProps} autoComplete="off" {...register("applicantContact")} />}
                      </FormField>
                    </div>
                  </ProgressiveStepShell>
                )}
                {step === 3 && (
                  <ProgressiveStepShell step={step} total={TOTAL_STEPS} title="Revisa y autoriza el envío" description="Confirma la categoría y acepta el tratamiento necesario para gestionar el caso.">
                    <dl className="grid gap-4 rounded-2xl bg-bg-soft p-5 sm:grid-cols-2">
                      <div><dt className="text-xs font-bold uppercase tracking-wider text-text-muted">Categoría</dt><dd className="mt-1 font-semibold">{PQR_CATEGORY_LABELS[getValues("category")]}</dd></div>
                      <div><dt className="text-xs font-bold uppercase tracking-wider text-text-muted">Contacto</dt><dd className="mt-1 break-words font-semibold">{getValues("applicantContact")}</dd></div>
                      <div className="sm:col-span-2"><dt className="text-xs font-bold uppercase tracking-wider text-text-muted">Descripción</dt><dd className="mt-1 whitespace-pre-wrap text-sm leading-6">{getValues("description")}</dd></div>
                    </dl>
                    <div className="mt-5">
                      <Checkbox {...register("dataProcessingAccepted")} label={<>Acepto el tratamiento necesario para gestionar mi caso conforme a la <Link to="/legal/tratamiento-de-datos" target="_blank" className="font-medium text-brand-dark hover:underline">Política de tratamiento</Link> y al <Link to="/legal/aviso-de-privacidad" target="_blank" className="font-medium text-brand-dark hover:underline">Aviso de privacidad</Link>.</>} />
                      {errors.dataProcessingAccepted && <p role="alert" className="mt-2 text-sm text-danger">{errors.dataProcessingAccepted.message}</p>}
                    </div>
                    {submitMutation.isError && <Alert variant="danger" className="mt-4">{submitMutation.error instanceof ApiError ? submitMutation.error.message : "No pudimos registrar el caso. Intenta nuevamente."}</Alert>}
                  </ProgressiveStepShell>
                )}
                <FlowActions canGoBack={step > 0} onBack={() => setStep((current) => Math.max(0, current - 1))} onNext={() => void advance()} nextLabel={step === TOTAL_STEPS - 2 ? (isBusy ? "Registrando…" : "Confirmar y enviar") : "Continuar"} nextDisabled={isBusy} />
              </form>
            )}
          </Card>
        )}

        {mode === "track" && (
          <Card className="mt-6 rounded-[1.75rem] p-5 sm:p-8">
            <h2 className="font-display text-2xl font-semibold text-text-main">Consulta el estado</h2>
            <p className="mt-2 text-sm leading-6 text-text-muted">Ingresa únicamente el número de caso recibido al radicar.</p>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                setLookupCaseNumber(lookupInput.trim() || null);
              }}
              className="mt-5 flex flex-col gap-3 sm:flex-row"
            >
              <Input aria-label="Número de caso" placeholder="Ejemplo: PQR-..." value={lookupInput} onChange={(event) => setLookupInput(event.target.value)} />
              <Button type="submit" disabled={!lookupInput.trim()} className="min-h-12">Consultar</Button>
            </form>
            {lookupQuery.isPending && lookupCaseNumber && <p role="status" className="mt-5 text-sm text-text-muted">Consultando el caso…</p>}
            {lookupQuery.isError && <Alert variant="danger" className="mt-5">No encontramos un caso con ese número. Verifica el dato e intenta nuevamente.</Alert>}
            {lookupQuery.data && (
              <div className="mt-5 rounded-2xl border border-border-soft p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div><p className="text-xs font-bold uppercase tracking-wider text-text-muted">Categoría</p><p className="mt-1 font-semibold text-text-main">{PQR_CATEGORY_LABELS[lookupQuery.data.category] ?? lookupQuery.data.category}</p></div>
                  <StatusBadge tone={statusTone(lookupQuery.data.status)} label={PQR_STATUS_LABELS[lookupQuery.data.status] ?? lookupQuery.data.status} />
                </div>
                <CompactStatusTimeline status={lookupQuery.data.status} label={PQR_STATUS_LABELS[lookupQuery.data.status] ?? lookupQuery.data.status} />
                {lookupQuery.data.resolution && <p className="mt-5 rounded-xl bg-bg-soft p-4 text-sm leading-6 text-text-main"><span className="font-semibold">Respuesta:</span> {lookupQuery.data.resolution}</p>}
                <p className="mt-4 text-xs leading-5 text-text-muted">Por seguridad, esta consulta pública no muestra datos del solicitante ni el contenido completo de la radicación.</p>
              </div>
            )}
          </Card>
        )}

        {policyQuery.data && (
          <details className="mt-6 rounded-2xl border border-brand-dark/10 bg-white/70 p-4">
            <summary className="flex min-h-12 cursor-pointer items-center text-sm font-semibold text-brand-dark">
              Proceso y política aplicable <Badge variant="success" className="ml-2">Versión {policyQuery.data.version}</Badge>
            </summary>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-text-muted">Selecciona la categoría, describe el caso y registra un medio de contacto. ASODEF asignará un número de seguimiento.</p>
            <Link to="/legal/pqr" className="mt-3 inline-flex min-h-12 items-center text-sm font-semibold text-brand-dark underline-offset-4 hover:underline">Consultar la política PQR vigente</Link>
          </details>
        )}
      </div>
    </section>
  );
}
