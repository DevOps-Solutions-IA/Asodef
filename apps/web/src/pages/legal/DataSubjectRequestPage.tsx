import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Alert, Button, Card, Checkbox, FormField, Input, Select, StatusBadge, Textarea } from "@asodef/ui";
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
import { lookupDataSubjectRequest, submitDataSubjectRequest } from "../../lib/data-subject-requests/data-subject-requests-api";
import {
  DATA_SUBJECT_REQUEST_STATUS_LABELS,
  DATA_SUBJECT_REQUEST_TYPES,
  DATA_SUBJECT_REQUEST_TYPE_LABELS,
  type DataSubjectRequestType,
} from "../../lib/data-subject-requests/data-subject-requests-types";

const STORAGE_KEY = "asodef:data-request-public-flow:v1";
const TOTAL_STEPS = 5;

const requestSchema = z.object({
  type: z.enum(DATA_SUBJECT_REQUEST_TYPES, { errorMap: () => ({ message: "Selecciona el tipo de solicitud." }) }),
  requesterName: z.string().min(1, "El nombre completo es requerido."),
  requesterEmail: z.string().min(1, "El correo electrónico es requerido.").email("Ingresa un correo electrónico válido."),
  requesterDocument: z.string().min(1, "El número de documento es requerido."),
  description: z.string().min(1, "La descripción de la solicitud es requerida."),
  dataProcessingAccepted: z.literal(true, { errorMap: () => ({ message: "Debes aceptar el tratamiento necesario para tramitar tu solicitud." }) }),
});

type RequestFormValues = z.infer<typeof requestSchema>;

interface RecoveredRequestState {
  mode: TransactionalMode | null;
  step: number;
  type?: DataSubjectRequestType;
  values: Partial<RequestFormValues>;
}

const typeDescriptions: Partial<Record<DataSubjectRequestType, string>> = {
  ACCESS: "Conocer los datos personales asociados a tu relación.",
  CONSULTATION: "Consultar información sobre el tratamiento de tus datos.",
  UPDATE: "Actualizar información que ha cambiado.",
  CORRECTION: "Corregir información inexacta o incompleta.",
  DELETION: "Solicitar la supresión cuando resulte procedente.",
  REVOCATION: "Revocar una autorización cuando resulte procedente.",
  PROOF_OF_AUTHORIZATION: "Solicitar evidencia de una autorización registrada.",
  DATA_USE_INFORMATION: "Conocer el uso dado a tus datos personales.",
  COMPLAINT: "Presentar un reclamo relacionado con el tratamiento.",
  IDENTITY_VERIFICATION: "Atender una verificación necesaria para una solicitud.",
  INCIDENT_REPORT: "Informar un posible incidente relacionado con datos.",
};

const typeOptions = DATA_SUBJECT_REQUEST_TYPES.map((value) => ({
  value,
  label: DATA_SUBJECT_REQUEST_TYPE_LABELS[value],
  description: typeDescriptions[value],
}));

function loadRecoveredState(): RecoveredRequestState {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "{}") as Partial<RecoveredRequestState>;
    const type = DATA_SUBJECT_REQUEST_TYPES.find((value) => value === parsed.type);
    const rawValues = parsed.values && typeof parsed.values === "object" ? parsed.values as Partial<RequestFormValues> : {};
    const values: Partial<RequestFormValues> = {
      type,
      requesterName: typeof rawValues.requesterName === "string" ? rawValues.requesterName : "",
      requesterEmail: typeof rawValues.requesterEmail === "string" ? rawValues.requesterEmail : "",
      requesterDocument: typeof rawValues.requesterDocument === "string" ? rawValues.requesterDocument : "",
      description: typeof rawValues.description === "string" ? rawValues.description : "",
      dataProcessingAccepted: rawValues.dataProcessingAccepted === true ? true : undefined,
    };
    const requestedStep = Number.isInteger(parsed.step) ? Math.min(Math.max(parsed.step ?? 0, 0), TOTAL_STEPS - 2) : 0;
    const recoverableStep = !type ? 0 : !values.description ? 1 : !values.requesterName || !values.requesterEmail || !values.requesterDocument ? 2 : requestedStep;
    return {
      mode: parsed.mode === "create" || parsed.mode === "track" ? parsed.mode : null,
      step: Math.min(requestedStep, recoverableStep),
      type,
      values,
    };
  } catch {
    return { mode: null, step: 0, values: {} };
  }
}

function statusTone(status: string): "pending" | "success" | "rejected" | "under_review" {
  if (status === "RESOLVED" || status === "CLOSED") return "success";
  if (status === "REJECTED_WITH_REASON") return "rejected";
  if (status === "IN_REVIEW" || status === "IDENTITY_VERIFICATION") return "under_review";
  return "pending";
}

export function DataSubjectRequestPage() {
  const [searchParams] = useSearchParams();
  const requestedMode = searchParams.get("accion") === "consultar" ? "track" : searchParams.get("accion") === "crear" ? "create" : null;
  const [recovered] = useState(loadRecoveredState);
  const [mode, setMode] = useState<TransactionalMode | null>(requestedMode ?? recovered.mode);
  const [step, setStep] = useState(recovered.step);
  const [trackingReference, setTrackingReference] = useState<string | null>(null);
  const [lookupInput, setLookupInput] = useState("");
  const [lookupReference, setLookupReference] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    getValues,
    setValue,
    trigger,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<RequestFormValues>({
    resolver: zodResolver(requestSchema),
    defaultValues: { type: recovered.type, requesterName: "", requesterEmail: "", requesterDocument: "", description: "", ...recovered.values },
  });
  const formValues = watch();
  const requestType = formValues.type;

  useEffect(() => {
    if (requestedMode) {
      setMode(requestedMode);
      setStep(0);
    }
  }, [requestedMode]);

  useEffect(() => {
    if (trackingReference) {
      sessionStorage.removeItem(STORAGE_KEY);
    } else if (mode || step > 0 || Object.values(formValues).some(Boolean)) {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ mode, step, type: requestType, values: formValues }));
    } else {
      sessionStorage.removeItem(STORAGE_KEY);
    }
  }, [formValues, mode, requestType, step, trackingReference]);

  const submitMutation = useMutation({
    mutationFn: submitDataSubjectRequest,
    onSuccess: (result) => {
      setTrackingReference(result.publicReference);
      sessionStorage.removeItem(STORAGE_KEY);
      reset();
    },
  });

  const onSubmit = handleSubmit(({ dataProcessingAccepted: _accepted, ...values }) => {
    if (!submitMutation.isPending) submitMutation.mutate(values);
  });

  const lookupQuery = useQuery({
    queryKey: ["data-subject-requests", "lookup", lookupReference],
    queryFn: () => lookupDataSubjectRequest(lookupReference!),
    enabled: Boolean(lookupReference),
    retry: false,
  });

  async function advance() {
    const fields: (keyof RequestFormValues)[][] = [
      ["type"],
      ["description"],
      ["requesterName", "requesterEmail", "requesterDocument"],
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
    setTrackingReference(null);
  }

  function restart() {
    reset();
    setTrackingReference(null);
    setStep(0);
    setMode(null);
    sessionStorage.removeItem(STORAGE_KEY);
  }

  const isBusy = isSubmitting || submitMutation.isPending;

  return (
    <section className="bg-[radial-gradient(circle_at_85%_0%,rgba(128,174,58,.13),transparent_28rem)] py-10 sm:py-14 lg:py-16">
      <div className="mx-auto max-w-5xl px-5 sm:px-8">
        <p className="text-xs font-bold uppercase tracking-[.18em] text-brand-dark">Derechos de titulares</p>
        <h1 className="mt-3 max-w-3xl font-display text-3xl font-semibold tracking-[-.035em] text-text-main sm:text-5xl">Gestiona una solicitud sobre tus datos</h1>
        <p className="mt-4 max-w-2xl leading-7 text-text-muted">Crea una solicitud para ejercer tus derechos o consulta una referencia ya registrada.</p>

        <Card className="mt-7 rounded-[1.75rem] p-4 sm:p-6">
          <TransactionalTaskSwitcher mode={mode} createLabel="Crear solicitud" trackLabel="Consultar referencia" onChange={chooseMode} />
        </Card>

        {!mode && <p className="mt-6 rounded-2xl border border-brand-dark/10 bg-white p-5 text-sm leading-6 text-text-muted">Elige si quieres registrar una solicitud nueva o consultar su estado.</p>}

        {mode === "create" && (
          <Card className="mt-6 rounded-[1.75rem] p-5 sm:p-8">
            {trackingReference ? (
              <ProgressiveStepShell step={4} total={TOTAL_STEPS} title="Solicitud registrada" description="La solicitud quedó radicada y ya puedes consultar su estado.">
                <ConfirmationPanel
                  title=""
                  reference={trackingReference}
                  referenceLabel="Referencia de seguimiento"
                  restartLabel="Crear otra solicitud"
                  onTrack={() => {
                    setLookupInput(trackingReference);
                    setLookupReference(trackingReference);
                    setTrackingReference(null);
                    setMode("track");
                  }}
                  onRestart={restart}
                >
                  Conserva esta referencia. Puedes copiarla, imprimir la confirmación o consultar el estado ahora.
                </ConfirmationPanel>
              </ProgressiveStepShell>
            ) : (
              <form onSubmit={onSubmit} noValidate>
                {step === 0 && (
                  <ProgressiveStepShell step={step} total={TOTAL_STEPS} title="¿Qué derecho o gestión quieres ejercer?" description="Elige el tipo que mejor corresponde a tu solicitud.">
                    <div className="sm:hidden">
                      <label htmlFor="mobile-request-type" className="text-sm font-semibold text-text-main">Tipo de solicitud</label>
                      <Select
                        id="mobile-request-type"
                        className="mt-2 min-h-12"
                        value={requestType ?? ""}
                        onChange={(event) => setValue("type", event.target.value as DataSubjectRequestType, { shouldValidate: true })}
                      >
                        <option value="">Selecciona una opción</option>
                        {typeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </Select>
                      {requestType && <p className="mt-3 text-sm leading-6 text-text-muted">{typeDescriptions[requestType]}</p>}
                    </div>
                    <div className="hidden sm:block">
                      <ChoiceGrid label="Tipo de solicitud" value={requestType} options={typeOptions} onChange={(value) => setValue("type", value as DataSubjectRequestType, { shouldValidate: true })} />
                    </div>
                    {errors.type && <p role="alert" className="mt-3 text-sm text-danger">{errors.type.message}</p>}
                  </ProgressiveStepShell>
                )}
                {step === 1 && (
                  <ProgressiveStepShell step={step} total={TOTAL_STEPS} title="Describe tu solicitud" description="Indica de forma concreta qué información o actuación necesitas.">
                    <FormField label="Descripción de la solicitud" error={errors.description?.message} required>
                      {(controlProps) => <Textarea {...controlProps} rows={6} {...register("description")} />}
                    </FormField>
                  </ProgressiveStepShell>
                )}
                {step === 2 && (
                  <ProgressiveStepShell step={step} total={TOTAL_STEPS} title="Identificación y contacto" description="Estos datos permiten verificar al titular y enviar la respuesta.">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <FormField label="Nombre completo" error={errors.requesterName?.message} required>
                        {(controlProps) => <Input {...controlProps} autoComplete="name" {...register("requesterName")} />}
                      </FormField>
                      <FormField label="Número de documento" error={errors.requesterDocument?.message} required>
                        {(controlProps) => <Input {...controlProps} autoComplete="off" {...register("requesterDocument")} />}
                      </FormField>
                      <FormField label="Correo electrónico" error={errors.requesterEmail?.message} required className="sm:col-span-2">
                        {(controlProps) => <Input {...controlProps} type="email" autoComplete="email" {...register("requesterEmail")} />}
                      </FormField>
                    </div>
                  </ProgressiveStepShell>
                )}
                {step === 3 && (
                  <ProgressiveStepShell step={step} total={TOTAL_STEPS} title="Revisa y autoriza el envío" description="Confirma la información antes de radicar la solicitud.">
                    <dl className="grid gap-4 rounded-2xl bg-bg-soft p-5 sm:grid-cols-2">
                      <div><dt className="text-xs font-bold uppercase tracking-wider text-text-muted">Tipo de solicitud</dt><dd className="mt-1 font-semibold">{DATA_SUBJECT_REQUEST_TYPE_LABELS[getValues("type")]}</dd></div>
                      <div><dt className="text-xs font-bold uppercase tracking-wider text-text-muted">Correo</dt><dd className="mt-1 break-words font-semibold">{getValues("requesterEmail")}</dd></div>
                      <div className="sm:col-span-2"><dt className="text-xs font-bold uppercase tracking-wider text-text-muted">Descripción</dt><dd className="mt-1 whitespace-pre-wrap text-sm leading-6">{getValues("description")}</dd></div>
                    </dl>
                    <div className="mt-5">
                      <Checkbox {...register("dataProcessingAccepted")} label={<>Acepto el tratamiento de mis datos exclusivamente para verificar, gestionar y responder esta solicitud conforme a la <Link to="/legal/tratamiento-de-datos" target="_blank" className="font-medium text-brand-dark hover:underline">Política de tratamiento</Link>.</>} />
                      {errors.dataProcessingAccepted && <p role="alert" className="mt-2 text-sm text-danger">{errors.dataProcessingAccepted.message}</p>}
                    </div>
                    {submitMutation.isError && <Alert variant="danger" className="mt-4">{submitMutation.error instanceof ApiError ? submitMutation.error.message : "No pudimos registrar la solicitud. Intenta nuevamente."}</Alert>}
                  </ProgressiveStepShell>
                )}
                <FlowActions canGoBack={step > 0} onBack={() => setStep((current) => Math.max(0, current - 1))} onNext={() => void advance()} nextLabel={step === TOTAL_STEPS - 2 ? (isBusy ? "Registrando…" : "Confirmar y enviar") : "Continuar"} nextDisabled={isBusy} />
              </form>
            )}
          </Card>
        )}

        {mode === "track" && (
          <Card className="mt-6 rounded-[1.75rem] p-5 sm:p-8">
            <h2 className="font-display text-2xl font-semibold text-text-main">Consulta una referencia</h2>
            <p className="mt-2 text-sm leading-6 text-text-muted">Ingresa únicamente la referencia recibida al radicar.</p>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                setLookupReference(lookupInput.trim() || null);
              }}
              className="mt-5 flex flex-col gap-3 sm:flex-row"
            >
              <Input aria-label="Referencia de seguimiento" placeholder="Referencia de seguimiento" value={lookupInput} onChange={(event) => setLookupInput(event.target.value)} />
              <Button type="submit" disabled={!lookupInput.trim()} className="min-h-12">Consultar</Button>
            </form>
            {lookupQuery.isPending && lookupReference && <p role="status" className="mt-5 text-sm text-text-muted">Consultando la solicitud…</p>}
            {lookupQuery.isError && <Alert variant="danger" className="mt-5">No encontramos una solicitud con esa referencia. Verifica el dato e intenta nuevamente.</Alert>}
            {lookupQuery.data && (
              <div className="mt-5 rounded-2xl border border-border-soft p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div><p className="text-xs font-bold uppercase tracking-wider text-text-muted">Tipo de solicitud</p><p className="mt-1 font-semibold text-text-main">{DATA_SUBJECT_REQUEST_TYPE_LABELS[lookupQuery.data.type as DataSubjectRequestType] ?? lookupQuery.data.type}</p></div>
                  <StatusBadge tone={statusTone(lookupQuery.data.status)} label={DATA_SUBJECT_REQUEST_STATUS_LABELS[lookupQuery.data.status] ?? lookupQuery.data.status} />
                </div>
                <CompactStatusTimeline status={lookupQuery.data.status} label={DATA_SUBJECT_REQUEST_STATUS_LABELS[lookupQuery.data.status] ?? lookupQuery.data.status} />
                {lookupQuery.data.resolution && <p className="mt-5 rounded-xl bg-bg-soft p-4 text-sm leading-6 text-text-main"><span className="font-semibold">Respuesta:</span> {lookupQuery.data.resolution}</p>}
                <p className="mt-4 text-xs leading-5 text-text-muted">Por seguridad, la consulta pública no muestra el documento, el correo ni el contenido completo de la solicitud.</p>
              </div>
            )}
          </Card>
        )}

        <details className="mt-6 rounded-2xl border border-brand-dark/10 bg-white/70 p-4">
          <summary className="flex min-h-12 cursor-pointer items-center text-sm font-semibold text-brand-dark">Cómo verificamos tu identidad</summary>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-text-muted">ASODEF puede requerir información adicional para verificar la identidad antes de responder. El formulario solicita solo los datos necesarios para identificar y gestionar la petición.</p>
          <Link to="/legal/procedimiento-consultas-y-reclamos" className="mt-3 inline-flex min-h-12 items-center text-sm font-semibold text-brand-dark underline-offset-4 hover:underline">Consultar el procedimiento vigente</Link>
        </details>
      </div>
    </section>
  );
}
