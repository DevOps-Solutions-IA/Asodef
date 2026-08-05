import { ASODEF_COMPANY } from "@asodef/config";

/**
 * US-044: initial DRAFT content for the 11 legal document types named in
 * the story's own acceptance criteria (the story title/description say
 * "10" - an internal PRD inconsistency, see project memory US-044 -
 * but the enumerated AC list has 11 items; the enumerated list is the
 * literal, testable instruction, so all 11 are seeded).
 *
 * Every section body is either a directly confirmed fact (ASODEF_COMPANY)
 * or the literal PLACEHOLDER string. No prices, guarantees, legal
 * representative, judicial notification email, retention periods, or
 * regulatory citations are invented - those are exactly the fields the
 * PRD says must stay unconfirmed until real legal review supplies them.
 *
 * Corporate-data update (2026-08-05): factual corporate fields now
 * confirmed by the ASODEF institutional dossier / corroborated public
 * business-registry sources - NIT and the registered address are now
 * filled in here (the address carries its own explicit verification
 * note, since it is corroborated but not yet Certificate-verified).
 * Still deliberately unfilled: legal representative, judicial
 * notification email - see ASODEF_PENDING_CORPORATE_FIELDS. This is a
 * content update only - no document status changes (still DRAFT,
 * still unapproved, still unpublished).
 */

export const LEGAL_CONTENT_PLACEHOLDER = "Pendiente de confirmación legal";

export interface LegalDocumentCatalogSection {
  heading: string;
  body: string;
}

export interface LegalDocumentCatalogEntry {
  type: string;
  title: string;
  slug: string;
  sections: readonly LegalDocumentCatalogSection[];
}

const IDENTIFICATION_SECTION: LegalDocumentCatalogSection = {
  heading: "Identificación de la empresa",
  body: `${ASODEF_COMPANY.legalName}. ${ASODEF_COMPANY.city}, ${ASODEF_COMPANY.department}, ${ASODEF_COMPANY.country}.`,
};

const REGISTERED_ADDRESS_SECTION: LegalDocumentCatalogSection = {
  heading: "Domicilio registrado",
  body: `${ASODEF_COMPANY.addressLine1}, ${ASODEF_COMPANY.city}, ${ASODEF_COMPANY.department}, ${ASODEF_COMPANY.country}. Nota de verificación interna: dirección corroborada mediante información pública de directorio empresarial reciente; aún no verificada contra un Certificado de Existencia y Representación Legal vigente.`,
};

const CONTACT_SECTION: LegalDocumentCatalogSection = {
  heading: "Contacto",
  body: `Correo electrónico corporativo: ${ASODEF_COMPANY.corporateEmail}. Contacto comercial: ${ASODEF_COMPANY.commercialContact.fullName}, ${ASODEF_COMPANY.commercialContact.role} (${ASODEF_COMPANY.commercialContact.whatsappUrl}).`,
};

const VERSION_SECTION: LegalDocumentCatalogSection = {
  heading: "Versión",
  body: "Documento en borrador (versión 1), pendiente de revisión y aprobación legal antes de su publicación.",
};

const PLACEHOLDER = LEGAL_CONTENT_PLACEHOLDER;

export const LEGAL_DOCUMENT_CATALOG: readonly LegalDocumentCatalogEntry[] = [
  {
    type: "corporate_info",
    title: "Información empresarial",
    slug: "informacion-empresarial",
    sections: [
      { heading: "Razón social", body: ASODEF_COMPANY.legalName },
      { heading: "Ciudad y país de operación", body: `${ASODEF_COMPANY.city}, ${ASODEF_COMPANY.department}, ${ASODEF_COMPANY.country}.` },
      { heading: "Correo electrónico corporativo", body: ASODEF_COMPANY.corporateEmail },
      {
        heading: "Contacto comercial",
        body: `${ASODEF_COMPANY.commercialContact.fullName}, ${ASODEF_COMPANY.commercialContact.role}. WhatsApp: ${ASODEF_COMPANY.commercialContact.whatsappUrl}`,
      },
      // Corporate-data update: never inserted, even now that other
      // corroborated facts have been added - no legal representative
      // has been confirmed, and this is deliberately never inferred
      // from staff/commercial-contact names.
      { heading: "Representante legal", body: PLACEHOLDER },
      REGISTERED_ADDRESS_SECTION,
      { heading: "Identificación tributaria (NIT)", body: `NIT ${ASODEF_COMPANY.taxId}` },
    ],
  },
  {
    type: "privacy_policy",
    title: "Política de privacidad",
    slug: "politica-de-privacidad",
    sections: [
      IDENTIFICATION_SECTION,
      { heading: "Responsable del tratamiento", body: `${ASODEF_COMPANY.legalName} (${ASODEF_COMPANY.corporateEmail}).` },
      { heading: "Datos personales recopilados", body: PLACEHOLDER },
      { heading: "Finalidad del tratamiento", body: PLACEHOLDER },
      { heading: "Derechos del titular", body: PLACEHOLDER },
      { heading: "Conservación de los datos", body: PLACEHOLDER },
      CONTACT_SECTION,
      VERSION_SECTION,
    ],
  },
  {
    type: "data_processing_policy",
    title: "Tratamiento de datos",
    slug: "tratamiento-de-datos",
    sections: [
      IDENTIFICATION_SECTION,
      { heading: "Responsable del tratamiento", body: `${ASODEF_COMPANY.legalName} (${ASODEF_COMPANY.corporateEmail}).` },
      { heading: "Base legal del tratamiento", body: PLACEHOLDER },
      { heading: "Finalidades específicas", body: PLACEHOLDER },
      { heading: "Transferencia y transmisión de datos", body: PLACEHOLDER },
      { heading: "Medidas de seguridad", body: PLACEHOLDER },
      { heading: "Derechos del titular y procedimiento", body: PLACEHOLDER },
      CONTACT_SECTION,
      VERSION_SECTION,
    ],
  },
  {
    type: "privacy_notice",
    title: "Aviso de privacidad",
    slug: "aviso-de-privacidad",
    sections: [
      IDENTIFICATION_SECTION,
      { heading: "Finalidad del aviso", body: PLACEHOLDER },
      { heading: "Datos tratados", body: PLACEHOLDER },
      { heading: "Mecanismos para ejercer derechos", body: PLACEHOLDER },
      { heading: "Cambios al aviso de privacidad", body: PLACEHOLDER },
      CONTACT_SECTION,
      VERSION_SECTION,
    ],
  },
  {
    type: "terms_and_conditions",
    title: "Términos y condiciones",
    slug: "terminos-y-condiciones",
    // US-044 AC[0]'s own literal topic list for this document, in order.
    sections: [
      IDENTIFICATION_SECTION,
      { heading: "Definiciones", body: PLACEHOLDER },
      { heading: "Elegibilidad", body: PLACEHOLDER },
      { heading: "Precios, impuestos y pagos", body: PLACEHOLDER },
      { heading: "Reembolsos y reversiones", body: PLACEHOLDER },
      { heading: "Cancelaciones", body: PLACEHOLDER },
      { heading: "Renovaciones", body: PLACEHOLDER },
      { heading: "Propiedad intelectual", body: PLACEHOLDER },
      { heading: "Responsabilidad", body: PLACEHOLDER },
      { heading: "Ley aplicable", body: PLACEHOLDER },
      CONTACT_SECTION,
      VERSION_SECTION,
    ],
  },
  {
    type: "payment_terms",
    title: "Términos de pago",
    slug: "terminos-de-pago",
    sections: [
      IDENTIFICATION_SECTION,
      { heading: "Métodos de pago aceptados", body: PLACEHOLDER },
      { heading: "Moneda y precios", body: PLACEHOLDER },
      { heading: "Procesamiento de pagos", body: PLACEHOLDER },
      { heading: "Facturación", body: PLACEHOLDER },
      CONTACT_SECTION,
      VERSION_SECTION,
    ],
  },
  {
    type: "refund_policy",
    title: "Reversiones y reembolsos",
    slug: "reversiones-y-reembolsos",
    sections: [
      IDENTIFICATION_SECTION,
      { heading: "Condiciones para reversión", body: PLACEHOLDER },
      { heading: "Condiciones para reembolso", body: PLACEHOLDER },
      { heading: "Plazos de procesamiento", body: PLACEHOLDER },
      { heading: "Procedimiento de solicitud", body: `Solicitudes vía ${ASODEF_COMPANY.corporateEmail}.` },
      CONTACT_SECTION,
      VERSION_SECTION,
    ],
  },
  {
    type: "cookie_policy",
    title: "Política de cookies",
    slug: "politica-de-cookies",
    sections: [
      IDENTIFICATION_SECTION,
      { heading: "Tipos de cookies utilizadas", body: PLACEHOLDER },
      { heading: "Finalidad de las cookies", body: PLACEHOLDER },
      { heading: "Gestión y preferencias de cookies", body: PLACEHOLDER },
      CONTACT_SECTION,
      VERSION_SECTION,
    ],
  },
  {
    type: "pqr",
    title: "PQR",
    slug: "pqr",
    sections: [
      IDENTIFICATION_SECTION,
      {
        heading: "Canal de radicación",
        body: `Correo electrónico: ${ASODEF_COMPANY.corporateEmail}. WhatsApp: ${ASODEF_COMPANY.commercialContact.whatsappUrl}.`,
      },
      { heading: "Tiempos de respuesta", body: PLACEHOLDER },
      { heading: "Procedimiento interno", body: PLACEHOLDER },
      CONTACT_SECTION,
      VERSION_SECTION,
    ],
  },
  {
    type: "security",
    title: "Seguridad",
    slug: "seguridad",
    sections: [
      IDENTIFICATION_SECTION,
      { heading: "Medidas de seguridad implementadas", body: PLACEHOLDER },
      { heading: "Reporte de incidentes de seguridad", body: PLACEHOLDER },
      { heading: "Canal de contacto para reportes", body: ASODEF_COMPANY.corporateEmail },
      VERSION_SECTION,
    ],
  },
  {
    type: "accessibility",
    title: "Accesibilidad",
    slug: "accesibilidad",
    sections: [
      IDENTIFICATION_SECTION,
      { heading: "Compromiso de accesibilidad", body: PLACEHOLDER },
      { heading: "Estándares seguidos", body: PLACEHOLDER },
      { heading: "Canal de contacto para reportar barreras de accesibilidad", body: ASODEF_COMPANY.corporateEmail },
      VERSION_SECTION,
    ],
  },
] as const;
