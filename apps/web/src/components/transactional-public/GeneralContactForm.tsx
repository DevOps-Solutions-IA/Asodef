import { useEffect, useMemo, useRef, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { z } from "zod";
import { Alert, Button, Checkbox, FormField, Input, Textarea } from "@asodef/ui";
import { CheckCircle2 } from "lucide-react";
import { submitGuidedLead } from "../../lib/leads/guided-leads";
import { CopyReferenceAction } from "../public/mobile";

const generalContactSchema = z.object({
  fullName: z.string().trim().min(1, "El nombre completo es requerido."),
  email: z.string().trim().email("Ingresa un correo electrónico válido."),
  message: z.string().trim().min(10, "Describe tu solicitud en al menos 10 caracteres."),
  dataProcessingConsent: z.literal(true, { errorMap: () => ({ message: "Debes aceptar el tratamiento necesario para gestionar el mensaje." }) }),
  emailConsent: z.literal(true, { errorMap: () => ({ message: "Debes autorizar el correo para que podamos responderte por ese canal." }) }),
  commercialConsent: z.boolean().optional(),
  website: z.string().optional(),
});

type GeneralContactValues = z.infer<typeof generalContactSchema>;

function createIdempotencyKey() {
  return typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function GeneralContactForm() {
  const location = useLocation();
  const [search] = useSearchParams();
  const [idempotencyKey, setIdempotencyKey] = useState(createIdempotencyKey);
  const resultRef = useRef<HTMLDivElement>(null);
  const campaign = useMemo(
    () => Object.fromEntries(
      ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"].flatMap((key) => {
        const value = search.get(key);
        return value ? [[key.replace(/_([a-z])/g, (_, character: string) => character.toUpperCase()), value]] : [];
      }),
    ),
    [search],
  );
  const {
    register,
    handleSubmit,
    reset,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<GeneralContactValues>({ resolver: zodResolver(generalContactSchema) });
  const mutation = useMutation({ mutationFn: submitGuidedLead });

  useEffect(() => {
    if (mutation.isSuccess || mutation.isError) resultRef.current?.focus();
  }, [mutation.isError, mutation.isSuccess]);

  const onSubmit = handleSubmit(
    (values) => {
      if (mutation.isPending) return;
      mutation.mutate({
        audience: "orientation",
        need: "Otro asunto",
        fullName: values.fullName,
        email: values.email,
        message: values.message,
        preferredContact: "email",
        dataProcessingConsent: true,
        emailConsent: true,
        commercialConsent: values.commercialConsent,
        idempotencyKey,
        entryRoute: `${location.pathname}${location.search}`,
        campaign,
        website: values.website,
      });
    },
    () => {
      const first = (["fullName", "email", "message", "dataProcessingConsent", "emailConsent"] as const).find((field) => errors[field]);
      if (first) setFocus(first);
    },
  );

  if (mutation.isSuccess) {
    return (
      <div ref={resultRef} tabIndex={-1} className="rounded-2xl border border-success/25 bg-success/5 p-4 focus:outline-none sm:rounded-[1.75rem] sm:p-8" role="status">
        <CheckCircle2 aria-hidden="true" className="h-8 w-8 text-success sm:h-10 sm:w-10" />
        <h2 className="mt-4 font-display text-2xl font-semibold text-text-main sm:mt-5 sm:text-3xl">Mensaje registrado</h2>
        <p className="mt-2 text-sm leading-6 text-text-muted sm:mt-3 sm:text-base sm:leading-7">Conserva la referencia para identificar esta solicitud de orientación.</p>
        <p className="mt-4 break-all rounded-xl bg-white px-3 py-3 font-mono text-sm font-bold text-brand-dark shadow-e1 sm:mt-5 sm:px-4 sm:text-base">{mutation.data.reference}</p>
        <div className="mt-5 grid grid-cols-2 gap-2 sm:mt-6 sm:flex sm:flex-row sm:flex-wrap sm:gap-3">
          <CopyReferenceAction value={mutation.data.reference} />
          <button
            type="button"
            className="public-button-secondary"
            onClick={() => {
              mutation.reset();
              reset();
              setIdempotencyKey(createIdempotencyKey());
            }}
          >
            Registrar otro mensaje
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-brand-dark/10 bg-white p-4 shadow-e2 sm:rounded-[1.75rem] sm:p-8">
      <h2 className="font-display text-2xl font-semibold leading-tight text-text-main sm:text-3xl">Registra un mensaje para orientación</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-text-muted sm:mt-3 sm:text-base sm:leading-7">Indica tu contacto y el asunto. No pedimos datos empresariales cuando no corresponden.</p>
      {mutation.isError && (
        <div ref={resultRef} tabIndex={-1} className="mt-5 focus:outline-none">
          <Alert variant="danger">{mutation.error instanceof Error ? mutation.error.message : "No pudimos registrar el mensaje. Intenta nuevamente."}</Alert>
        </div>
      )}
      <form onSubmit={onSubmit} noValidate className="mt-5 grid gap-3 sm:mt-7 sm:grid-cols-2 sm:gap-4">
        <FormField label="Nombre completo" error={errors.fullName?.message} required>
          {(controlProps) => <Input {...controlProps} autoComplete="name" {...register("fullName")} />}
        </FormField>
        <FormField label="Correo electrónico" error={errors.email?.message} required>
          {(controlProps) => <Input {...controlProps} type="email" autoComplete="email" {...register("email")} />}
        </FormField>
        <FormField label="Mensaje" error={errors.message?.message} required className="sm:col-span-2">
          {(controlProps) => <Textarea {...controlProps} rows={3} maxLength={1200} {...register("message")} />}
        </FormField>
        <div aria-hidden="true" className="absolute h-0 w-0 overflow-hidden opacity-0">
          <label>No completar este campo<input type="text" tabIndex={-1} autoComplete="off" {...register("website")} /></label>
        </div>
        <div className="space-y-3 sm:col-span-2 sm:space-y-4">
          <div>
            <Checkbox {...register("dataProcessingConsent")} label={<>Autorizo el tratamiento necesario para gestionar este mensaje. <Link className="font-medium text-brand-dark underline-offset-4 hover:underline" target="_blank" rel="noopener noreferrer" to="/legal/tratamiento-de-datos">Consultar política</Link>.</>} />
            {errors.dataProcessingConsent && <p role="alert" className="mt-2 text-sm text-danger">{errors.dataProcessingConsent.message}</p>}
          </div>
          <div>
            <Checkbox {...register("emailConsent")} label={<>Acepto recibir la respuesta por correo electrónico. <Link className="font-medium text-brand-dark underline-offset-4 hover:underline" target="_blank" rel="noopener noreferrer" to="/legal/consentimiento-correo-electronico">Consultar consentimiento</Link>.</>} />
            {errors.emailConsent && <p role="alert" className="mt-2 text-sm text-danger">{errors.emailConsent.message}</p>}
          </div>
          <Checkbox {...register("commercialConsent")} label={<>Opcional: acepto comunicaciones comerciales. <Link className="font-medium text-brand-dark underline-offset-4 hover:underline" target="_blank" rel="noopener noreferrer" to="/legal/consentimiento-comunicaciones-comerciales">Consultar consentimiento</Link>.</>} />
        </div>
        <Button type="submit" loading={isSubmitting || mutation.isPending} disabled={isSubmitting || mutation.isPending} className="min-h-12 w-full sm:col-span-2">Enviar mensaje</Button>
      </form>
    </div>
  );
}
