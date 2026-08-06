import { useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Mail, MessageCircle, MapPin } from "lucide-react";
import { Alert, Button, Checkbox, EmptyState, FormField, SectionHeading, Textarea, Input } from "@asodef/ui";
import { ASODEF_COMPANY } from "@asodef/config";
import { ApiError } from "../../lib/api-error";
import { submitLead } from "../../lib/leads/leads-api";
import { getPublicLegalDocument } from "../../lib/legal/legal-api";
import { queryKeys } from "../../lib/query-keys";

const DATA_PROCESSING_POLICY_SLUG = "tratamiento-de-datos";

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
  commercialConsentAccepted: z.boolean().optional(),
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

  // The submission form requires a PUBLISHED tratamiento-de-datos version
  // (LeadsService.create - fails closed rather than record consent
  // against unapproved content). Checked proactively here, same
  // getPublicLegalDocument()/ApiError.kind === "not_found" pattern
  // LegalDocumentPage already uses, so a visitor sees a clear
  // form-unavailable state up front instead of filling out the whole
  // form only to get a generic "check your input" message that doesn't
  // describe the real (server-side, not user-side) cause.
  const policyQuery = useQuery({
    queryKey: queryKeys.legalDocuments.detail(DATA_PROCESSING_POLICY_SLUG),
    queryFn: () => getPublicLegalDocument(DATA_PROCESSING_POLICY_SLUG),
    retry: false,
  });
  const formUnavailable = policyQuery.isError && policyQuery.error instanceof ApiError && policyQuery.error.kind === "not_found";

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
        {/* Institutional contact channels (Section 5, CONTACTO) - always
         * shown regardless of whether the form itself is available. */}
        <dl className="mb-10 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="flex items-start gap-3 rounded-2xl border border-border-soft bg-white p-4 shadow-e1 transition-shadow duration-200 hover:shadow-e2">
            <MessageCircle aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-brand-dark" />
            <div>
              <dt className="text-sm font-medium text-text-main">{ASODEF_COMPANY.commercialContact.fullName}</dt>
              <dd className="text-sm text-text-muted">{ASODEF_COMPANY.commercialContact.role}</dd>
              <dd className="mt-1">
                <a
                  href={ASODEF_COMPANY.commercialContact.whatsappUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm font-medium text-brand-dark hover:underline"
                >
                  {/* Same spaced-grouping display as the site footer -
                   * commercialContact.whatsapp itself has no spaces. */}
                  WhatsApp 323 273 3927
                </a>
              </dd>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-2xl border border-border-soft bg-white p-4 shadow-e1 transition-shadow duration-200 hover:shadow-e2">
            <Mail aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-brand-dark" />
            <div>
              <dt className="text-sm font-medium text-text-main">Correo electrónico</dt>
              <dd className="mt-1">
                <a href={`mailto:${ASODEF_COMPANY.corporateEmail}`} className="text-sm font-medium text-brand-dark hover:underline">
                  {ASODEF_COMPANY.corporateEmail}
                </a>
              </dd>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-2xl border border-border-soft bg-white p-4 shadow-e1 transition-shadow duration-200 hover:shadow-e2">
            <MapPin aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-brand-dark" />
            <div>
              <dt className="text-sm font-medium text-text-main">Oficina principal</dt>
              <dd className="text-sm text-text-muted">
                {ASODEF_COMPANY.addressLine1}, {ASODEF_COMPANY.city}, {ASODEF_COMPANY.country}
              </dd>
            </div>
          </div>
        </dl>

        {(submitLeadMutation.isSuccess || submitLeadMutation.isError) && (
          <div ref={messageRef} tabIndex={-1} className="mb-6 focus:outline-none">
            <Alert variant={submitLeadMutation.isSuccess ? "success" : "danger"}>
              {submitLeadMutation.isSuccess
                ? "¡Gracias! Hemos recibido tu mensaje y te contactaremos pronto."
                : submitLeadMutation.error?.message}
            </Alert>
          </div>
        )}

        {formUnavailable ? (
          <EmptyState
            icon={<MessageCircle className="h-10 w-10" aria-hidden="true" />}
            title="Formulario no disponible por ahora"
            description="Nuestro formulario de contacto está temporalmente deshabilitado mientras completamos su revisión legal. Mientras tanto, puedes escribirnos directamente por WhatsApp o correo electrónico usando los canales de arriba."
          />
        ) : (
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
                  <Link
                    to="/legal/tratamiento-de-datos"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-brand-dark hover:underline"
                  >
                    tratamiento de mis datos personales
                  </Link>
                  .
                </>
              }
            />
            {errors.consentAccepted && <p className="mt-1.5 text-sm text-danger">{errors.consentAccepted.message}</p>}
          </div>

          <div className="sm:col-span-2">
            <Checkbox
              {...register("commercialConsentAccepted")}
              label={<>Quiero recibir novedades y beneficios de ASODEF. Este consentimiento es opcional y puedo revocarlo. Consulta el <Link to="/legal/consentimiento-comunicaciones-comerciales" target="_blank" rel="noopener noreferrer" className="font-medium text-brand-dark hover:underline">consentimiento de comunicaciones comerciales</Link>.</>}
            />
          </div>

          <Button type="submit" loading={isBusy} disabled={isBusy} className="sm:col-span-2">
            Enviar mensaje
          </Button>
        </form>
        )}
      </div>
    </section>
  );
}
