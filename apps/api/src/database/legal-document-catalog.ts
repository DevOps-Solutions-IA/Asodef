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
  // US-069: verified against the Certificado de Existencia y
  // Representación Legal (Cámara de Comercio de Cali, verificación
  // 08264BJBC4) - no longer only PUBLIC_REGISTRY_CORROBORATED.
  body: `${ASODEF_COMPANY.addressLine1}, ${ASODEF_COMPANY.city}, ${ASODEF_COMPANY.department}, ${ASODEF_COMPANY.country}. Nota de verificación interna: dirección verificada mediante Certificado de Existencia y Representación Legal, código de verificación ${ASODEF_COMPANY.certificateVerificationCode}, expedido el ${ASODEF_COMPANY.certificateIssueDate}.`,
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
      // US-069: confirmed by the Certificado de Existencia y
      // Representacion Legal (Camara de Comercio de Cali, verificacion
      // 08264BJBC4) - no longer PLACEHOLDER.
      {
        heading: "Representante legal",
        body: `Principal: ${ASODEF_COMPANY.legalRepresentativeName} (${ASODEF_COMPANY.legalRepresentativeDocument}). Suplente: ${ASODEF_COMPANY.alternateLegalRepresentative}.`,
      },
      {
        heading: "Matrícula mercantil",
        body: `${ASODEF_COMPANY.chamberOfCommerce}, matrícula ${ASODEF_COMPANY.commercialRegistrationNumber}, registrada el ${ASODEF_COMPANY.registrationDate}. Último año renovado: ${ASODEF_COMPANY.lastRenewalYear}.`,
      },
      { heading: "Tamaño empresarial", body: `${ASODEF_COMPANY.companySize} (clasificación DANE, Decreto 1074 de 2015 y Resolución 2225 de 2019).` },
      REGISTERED_ADDRESS_SECTION,
      { heading: "Identificación tributaria (NIT)", body: `NIT ${ASODEF_COMPANY.taxId}` },
      {
        heading: "Verificación del certificado",
        body: `Datos verificados mediante Certificado de Existencia y Representación Legal, código de verificación ${ASODEF_COMPANY.certificateVerificationCode}, expedido el ${ASODEF_COMPANY.certificateIssueDate}.`,
      },
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
  // US-068: 10 additional document types, closing the gap between the
  // 22 types the PRD extension enumerates and the 11 originally seeded
  // by US-044. Same discipline as above: confirmed facts inserted
  // literally, everything else PLACEHOLDER - never fabricated.
  {
    type: "general_data_authorization",
    title: "Autorización general de tratamiento",
    slug: "autorizacion-general-de-tratamiento",
    sections: [
      IDENTIFICATION_SECTION,
      { heading: "Alcance de la autorización", body: PLACEHOLDER },
      { heading: "Datos autorizados a tratar", body: PLACEHOLDER },
      { heading: "Vigencia de la autorización", body: PLACEHOLDER },
      { heading: "Mecanismo de revocación", body: PLACEHOLDER },
      CONTACT_SECTION,
      VERSION_SECTION,
    ],
  },
  {
    type: "whatsapp_consent",
    title: "Consentimiento para WhatsApp",
    slug: "consentimiento-whatsapp",
    sections: [
      IDENTIFICATION_SECTION,
      { heading: "Canal", body: `WhatsApp comercial: ${ASODEF_COMPANY.commercialContact.whatsappUrl}.` },
      { heading: "Finalidad de los mensajes por WhatsApp", body: PLACEHOLDER },
      { heading: "Cómo revocar este consentimiento", body: PLACEHOLDER },
      CONTACT_SECTION,
      VERSION_SECTION,
    ],
  },
  {
    type: "email_consent",
    title: "Consentimiento para correo electrónico",
    slug: "consentimiento-correo-electronico",
    sections: [
      IDENTIFICATION_SECTION,
      { heading: "Canal", body: `Correo electrónico corporativo: ${ASODEF_COMPANY.corporateEmail}.` },
      { heading: "Finalidad de los correos electrónicos", body: PLACEHOLDER },
      { heading: "Cómo revocar este consentimiento", body: PLACEHOLDER },
      CONTACT_SECTION,
      VERSION_SECTION,
    ],
  },
  {
    type: "commercial_communications_consent",
    title: "Consentimiento de comunicaciones comerciales",
    slug: "consentimiento-comunicaciones-comerciales",
    sections: [
      IDENTIFICATION_SECTION,
      { heading: "Tipos de comunicaciones comerciales", body: PLACEHOLDER },
      { heading: "Independencia de mensajes transaccionales", body: PLACEHOLDER },
      { heading: "Cómo revocar este consentimiento", body: PLACEHOLDER },
      CONTACT_SECTION,
      VERSION_SECTION,
    ],
  },
  {
    type: "sensitive_data_processing",
    title: "Tratamiento de datos sensibles",
    slug: "tratamiento-datos-sensibles",
    sections: [
      IDENTIFICATION_SECTION,
      { heading: "Categorías de datos sensibles tratadas", body: PLACEHOLDER },
      { heading: "Carácter facultativo de las respuestas", body: PLACEHOLDER },
      { heading: "Medidas de seguridad reforzadas", body: PLACEHOLDER },
      CONTACT_SECTION,
      VERSION_SECTION,
    ],
  },
  {
    type: "minors_beneficiaries_processing",
    title: "Tratamiento de datos de menores y beneficiarios",
    slug: "tratamiento-menores-y-beneficiarios",
    sections: [
      IDENTIFICATION_SECTION,
      { heading: "Alcance frente a menores y beneficiarios reportados", body: PLACEHOLDER },
      { heading: "Consentimiento del representante legal del menor", body: PLACEHOLDER },
      { heading: "Interés superior del menor", body: PLACEHOLDER },
      CONTACT_SECTION,
      VERSION_SECTION,
    ],
  },
  {
    type: "data_subject_request_procedure",
    title: "Procedimiento de consultas y reclamos de titulares",
    slug: "procedimiento-consultas-y-reclamos",
    sections: [
      IDENTIFICATION_SECTION,
      { heading: "Canal de radicación de consultas y reclamos", body: ASODEF_COMPANY.corporateEmail },
      { heading: "Requisitos de la solicitud", body: PLACEHOLDER },
      { heading: "Términos legales de respuesta", body: PLACEHOLDER },
      CONTACT_SECTION,
      VERSION_SECTION,
    ],
  },
  {
    type: "electronic_communications_policy",
    title: "Política de comunicaciones electrónicas",
    slug: "politica-comunicaciones-electronicas",
    sections: [
      IDENTIFICATION_SECTION,
      {
        heading: "Notificación judicial electrónica",
        body: `${ASODEF_COMPANY.legalName} autorizó recibir notificaciones judiciales por correo electrónico, conforme al Artículo 291 del Código General del Proceso y al Artículo 67 del Código de Procedimiento Administrativo y de lo Contencioso Administrativo (CPACA), según consta en su Certificado de Existencia y Representación Legal (código de verificación ${ASODEF_COMPANY.certificateVerificationCode}). Correo de notificación judicial: ${ASODEF_COMPANY.judicialNotificationEmail}.`,
      },
      { heading: "Otras comunicaciones electrónicas", body: PLACEHOLDER },
      CONTACT_SECTION,
      VERSION_SECTION,
    ],
  },
  {
    type: "business_portal_terms",
    title: "Condiciones del portal empresarial",
    slug: "condiciones-portal-empresarial",
    sections: [
      IDENTIFICATION_SECTION,
      { heading: "Acceso y elegibilidad", body: PLACEHOLDER },
      { heading: "Uso permitido del portal empresarial", body: PLACEHOLDER },
      { heading: "Responsabilidades de la empresa aliada", body: PLACEHOLDER },
      CONTACT_SECTION,
      VERSION_SECTION,
    ],
  },
  {
    type: "affiliate_portal_terms",
    title: "Condiciones del portal de usuario o afiliado",
    slug: "condiciones-portal-afiliado",
    sections: [
      IDENTIFICATION_SECTION,
      { heading: "Acceso y elegibilidad", body: PLACEHOLDER },
      { heading: "Uso permitido del portal de afiliado", body: PLACEHOLDER },
      { heading: "Responsabilidades del afiliado", body: PLACEHOLDER },
      CONTACT_SECTION,
      VERSION_SECTION,
    ],
  },
] as const;
