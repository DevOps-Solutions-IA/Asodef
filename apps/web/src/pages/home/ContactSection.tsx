import { useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { Alert, Button, Checkbox, FormField, SectionHeading, Textarea, Input } from "@asodef/ui";
import { submitLead } from "../../lib/leads/leads-api";

const contactSchema = z.object({
  nombreCompleto: z.string().min(1, "El nombre completo es requerido."),
  empresa: z.string().min(1, "La empresa es requerida."),
  cargo: z.string().min(1, "El cargo es requerido."),
  ciudad: z.string().min(1, "La ciudad es requerida."),
  telefono: z.string().min(1, "El teléfono/WhatsApp es requerido."),
  correo: z.string().min(1, "El correo electrónico es requerido.").email("Ingresa un correo electrónico válido."),
  sector: z.string().min(1, "El sector es requerido."),
  mensaje: z.string().min(1, "El mensaje es requerido."),
  consentAccepted: z.literal(true, {
    errorMap: () => ({ message: "Debes aceptar el tratamiento de datos para continuar." }),
  }),
  // Honeypot - never shown to a real visitor (see the hidden field below).
  website: z.string().optional(),
});

type ContactFormValues = z.infer<typeof contactSchema>;

const FIELD_ORDER = ["nombreCompleto", "empresa", "cargo", "ciudad", "telefono", "correo", "sector", "mensaje", "consentAccepted"] as const;

export interface ContactSectionProps {
  eyebrow?: string;
  heading?: string;
  description?: string;
}

/**
 * US-018: Contact form posting to the existing POST /api/v1/leads
 * (US-017) - same request/response contract, no fake submission
 * behavior. Mirrors ResetPasswordPage's exact form conventions: fields
 * are preserved (never reset) on error, only cleared on success.
 */
export function ContactSection({ eyebrow, heading, description }: ContactSectionProps) {
  const messageRef = useRef<HTMLDivElement>(null);

  const {
    register,
    handleSubmit,
    setFocus,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ContactFormValues>({ resolver: zodResolver(contactSchema) });

  const submitLeadMutation = useMutation({
    mutationFn: (values: ContactFormValues) => submitLead(values),
    onSuccess: () => {
      reset();
    },
  });

  useEffect(() => {
    if (submitLeadMutation.isSuccess || submitLeadMutation.isError) {
      messageRef.current?.focus();
    }
  }, [submitLeadMutation.isSuccess, submitLeadMutation.isError]);

  if (!heading) {
    return null;
  }

  const onSubmit = handleSubmit(
    (values) => {
      if (submitLeadMutation.isPending) return;
      submitLeadMutation.mutate(values);
    },
    () => {
      const firstErrorField = FIELD_ORDER.find((field) => errors[field]);
      if (firstErrorField) setFocus(firstErrorField);
    },
  );

  const isBusy = isSubmitting || submitLeadMutation.isPending;

  return (
    <section id="contacto" aria-labelledby={heading ? "contact-heading" : undefined} className="scroll-mt-24 py-20 md:py-28">
      {heading && <SectionHeading eyebrow={eyebrow} title={heading} description={description} headingId="contact-heading" />}

      <div className="mx-auto mt-10 max-w-2xl">
        {(submitLeadMutation.isSuccess || submitLeadMutation.isError) && (
          <div ref={messageRef} tabIndex={-1} className="mb-6 focus:outline-none">
            <Alert variant={submitLeadMutation.isSuccess ? "success" : "danger"}>
              {submitLeadMutation.isSuccess
                ? "¡Gracias! Hemos recibido tu mensaje y te contactaremos pronto."
                : submitLeadMutation.error?.message}
            </Alert>
          </div>
        )}

        <form onSubmit={onSubmit} noValidate className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Nombre completo" error={errors.nombreCompleto?.message} required>
            {(controlProps) => <Input {...controlProps} autoComplete="name" {...register("nombreCompleto")} />}
          </FormField>

          <FormField label="Empresa" error={errors.empresa?.message} required>
            {(controlProps) => <Input {...controlProps} autoComplete="organization" {...register("empresa")} />}
          </FormField>

          <FormField label="Cargo" error={errors.cargo?.message} required>
            {(controlProps) => <Input {...controlProps} autoComplete="organization-title" {...register("cargo")} />}
          </FormField>

          <FormField label="Ciudad" error={errors.ciudad?.message} required>
            {(controlProps) => <Input {...controlProps} autoComplete="address-level2" {...register("ciudad")} />}
          </FormField>

          <FormField label="Teléfono / WhatsApp" error={errors.telefono?.message} required>
            {(controlProps) => <Input {...controlProps} type="tel" autoComplete="tel" {...register("telefono")} />}
          </FormField>

          <FormField label="Correo electrónico" error={errors.correo?.message} required>
            {(controlProps) => <Input {...controlProps} type="email" autoComplete="email" {...register("correo")} />}
          </FormField>

          <FormField label="Sector" error={errors.sector?.message} required className="sm:col-span-2">
            {(controlProps) => <Input {...controlProps} autoComplete="off" {...register("sector")} />}
          </FormField>

          <FormField label="Mensaje" error={errors.mensaje?.message} required className="sm:col-span-2">
            {(controlProps) => <Textarea {...controlProps} rows={4} {...register("mensaje")} />}
          </FormField>

          {/* Honeypot: visually hidden, never reachable via keyboard/tab,
           * never announced to assistive tech - a real visitor never
           * populates it. */}
          <div aria-hidden="true" className="absolute h-0 w-0 overflow-hidden opacity-0">
            <label>
              No completar este campo
              <input type="text" tabIndex={-1} autoComplete="off" {...register("website")} />
            </label>
          </div>

          <div className="sm:col-span-2">
            <Checkbox
              {...register("consentAccepted")}
              label={
                <>
                  Acepto el{" "}
                  <Link to="/legal/tratamiento-de-datos" className="font-medium text-brand-dark hover:underline">
                    tratamiento de mis datos personales
                  </Link>
                  .
                </>
              }
            />
            {errors.consentAccepted && <p className="mt-1.5 text-sm text-danger">{errors.consentAccepted.message}</p>}
          </div>

          <Button type="submit" loading={isBusy} disabled={isBusy} className="sm:col-span-2">
            Enviar mensaje
          </Button>
        </form>
      </div>
    </section>
  );
}
