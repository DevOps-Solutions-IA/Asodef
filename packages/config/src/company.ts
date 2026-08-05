/**
 * Confirmed ASODEF corporate facts only. Do not add fields here (legal
 * representative, exact registered address, judicial notification email,
 * prices, guarantees) unless the value has been explicitly confirmed —
 * see PRD rule on never inventing unverified legal/commercial facts.
 *
 * Extended with corporate master data confirmed by the user directly
 * (source hierarchy: ASODEF institutional dossier > public
 * business-registry sources > existing project-approved content) - see
 * ASODEF_CORPORATE_FIELD_PROVENANCE below for per-field sourcing and
 * verification status, and ASODEF_PENDING_CORPORATE_FIELDS for every
 * field that remains deliberately unconfirmed.
 */
export const ASODEF_COMPANY = {
  legalName: "ASODEF S.A.S.",
  tagline: "Trabajamos pensando en su bienestar.",
  corporateEmail: "info@asodef.com.co",
  city: "Cali",
  country: "Colombia",
  commercialContact: {
    fullName: "Juan Pablo Filigrana",
    role: "Director Comercial",
    whatsapp: "3232733927",
    whatsappUrl: "https://wa.me/573232733927",
  },

  // --- Corporate master data ---
  taxId: "900552882-2",
  taxIdDigits: "900552882",
  legalForm: "Sociedad por Acciones Simplificada",
  chamberOfCommerce: "Cámara de Comercio de Cali",
  commercialRegistrationNumber: "854303",
  registrationDate: "2012-09-10",
  registrationStatus: "ACTIVE",
  economicActivityCode: "9603",
  economicActivityLabel: "Pompas fúnebres y actividades relacionadas",
  department: "Valle del Cauca",
  // commercialContact.whatsapp/whatsappUrl above already encode this
  // same confirmed number - kept here too as its own top-level field
  // for direct correspondence with the corporate-data field list.
  commercialWhatsApp: "573232733927",
  addressLine1: "Carrera 40 # 5A-116",

  // --- Confirmed by Certificado de Existencia y Representación Legal,
  // Cámara de Comercio de Cali, código de verificación 08264BJBC4,
  // expedido 2026-08-05 (US-069). This resolves several fields that
  // were previously only PUBLIC_REGISTRY_CORROBORATED (see
  // ASODEF_CORPORATE_FIELD_PROVENANCE below, now upgraded to
  // CHAMBER_CERTIFICATE_CONFIRMED) plus fields that were previously
  // absent from ASODEF_PENDING_CORPORATE_FIELDS.
  legalRepresentativeName: "Adolfo Reyes Gómez",
  legalRepresentativeDocument: "C.C. 19435519",
  alternateLegalRepresentative: "María Adelaida París Gómez (C.C. 52045033)",
  judicialNotificationEmail: "juridica1@capillasdelafe.com",
  registeredPhone: "3012288760",
  lastRenewalYear: 2026,
  fullCorporatePurpose: "Venta de planes de prevención exequial, y cualquier otra actividad económica lícita.",
  certificateIssueDate: "2026-08-05",
  certificateVerificationCode: "08264BJBC4",
  companySize: "MICRO",
} as const;

// Deliberately NOT added above, even though the same certificate
// discloses it: the Grupo Empresarial control situation (Ley 222 de
// 1995) - ADOLFO REYES GÓMEZ exercises indirect control over ASODEF
// via COORSERPARK S.A.S. (its sole shareholder), and the wider group
// includes 7 other companies - and the certified annual revenue
// figure. Both are genuine, confirmed facts, but they are corporate
// control/financial disclosures, not identity/contact facts a public
// institutional legal page should surface. See ASODEF_PENDING_CORPORATE_FIELDS.shareholders
// and US-069's acceptance criteria for the explicit decision record.

export type CorporateFieldVerificationStatus =
  | "INSTITUTIONAL_DOSSIER_CONFIRMED"
  | "PUBLIC_REGISTRY_CORROBORATED"
  | "PENDING_CURRENT_CHAMBER_CERTIFICATE"
  | "CHAMBER_CERTIFICATE_CONFIRMED";

export interface CorporateFieldProvenance {
  sourceType: string;
  sourceDescription: string;
  verificationStatus: CorporateFieldVerificationStatus;
  verifiedAt: string | null;
  notes: string | null;
}

/**
 * Section 7 requirement: per-field value/sourceType/sourceDescription/
 * verificationStatus/verifiedAt/notes. Deliberately a separate export
 * from ASODEF_COMPANY (not merged into it) so every existing consumer
 * of ASODEF_COMPANY's plain values keeps working unchanged - this is
 * additive provenance metadata, not a replacement shape.
 *
 * The address is explicitly PUBLIC_REGISTRY_CORROBORATED, never
 * CERTIFICATE_VERIFIED - it has not been checked against a current
 * Certificate of Existence and Legal Representation.
 */
export const ASODEF_CORPORATE_FIELD_PROVENANCE: Record<string, CorporateFieldProvenance> = {
  legalName: {
    sourceType: "INSTITUTIONAL_DOSSIER",
    sourceDescription: "ASODEF institutional dossier",
    verificationStatus: "INSTITUTIONAL_DOSSIER_CONFIRMED",
    verifiedAt: null,
    notes: null,
  },
  taxId: {
    sourceType: "CHAMBER_OF_COMMERCE_CERTIFICATE",
    sourceDescription: "Certificado de Existencia y Representación Legal, Cámara de Comercio de Cali, verificación 08264BJBC4 (NIT 900552882-2)",
    verificationStatus: "CHAMBER_CERTIFICATE_CONFIRMED",
    verifiedAt: "2026-08-05",
    notes: null,
  },
  legalForm: {
    sourceType: "CHAMBER_OF_COMMERCE_CERTIFICATE",
    sourceDescription: "Certificado de Existencia y Representación Legal, Cámara de Comercio de Cali, verificación 08264BJBC4",
    verificationStatus: "CHAMBER_CERTIFICATE_CONFIRMED",
    verifiedAt: "2026-08-05",
    notes: null,
  },
  chamberOfCommerce: {
    sourceType: "CHAMBER_OF_COMMERCE_CERTIFICATE",
    sourceDescription: "Certificado de Existencia y Representación Legal, Cámara de Comercio de Cali, verificación 08264BJBC4",
    verificationStatus: "CHAMBER_CERTIFICATE_CONFIRMED",
    verifiedAt: "2026-08-05",
    notes: null,
  },
  commercialRegistrationNumber: {
    sourceType: "CHAMBER_OF_COMMERCE_CERTIFICATE",
    sourceDescription: "Certificado de Existencia y Representación Legal, Cámara de Comercio de Cali, verificación 08264BJBC4 (Matrícula Mercantil 854303-16)",
    verificationStatus: "CHAMBER_CERTIFICATE_CONFIRMED",
    verifiedAt: "2026-08-05",
    notes: null,
  },
  registrationDate: {
    sourceType: "CHAMBER_OF_COMMERCE_CERTIFICATE",
    sourceDescription: "Certificado de Existencia y Representación Legal, Cámara de Comercio de Cali, verificación 08264BJBC4",
    verificationStatus: "CHAMBER_CERTIFICATE_CONFIRMED",
    verifiedAt: "2026-08-05",
    notes: null,
  },
  registrationStatus: {
    sourceType: "CHAMBER_OF_COMMERCE_CERTIFICATE",
    sourceDescription: "Certificado de Existencia y Representación Legal, Cámara de Comercio de Cali, verificación 08264BJBC4 (sin recursos pendientes, no disuelta, duración indefinida)",
    verificationStatus: "CHAMBER_CERTIFICATE_CONFIRMED",
    verifiedAt: "2026-08-05",
    notes: null,
  },
  economicActivityCode: {
    sourceType: "CHAMBER_OF_COMMERCE_CERTIFICATE",
    sourceDescription: "Certificado de Existencia y Representación Legal, Cámara de Comercio de Cali, verificación 08264BJBC4 (CIIU 9603)",
    verificationStatus: "CHAMBER_CERTIFICATE_CONFIRMED",
    verifiedAt: "2026-08-05",
    notes: null,
  },
  city: {
    sourceType: "INSTITUTIONAL_DOSSIER",
    sourceDescription: "ASODEF institutional dossier",
    verificationStatus: "INSTITUTIONAL_DOSSIER_CONFIRMED",
    verifiedAt: null,
    notes: null,
  },
  department: {
    sourceType: "CHAMBER_OF_COMMERCE_CERTIFICATE",
    sourceDescription: "Certificado de Existencia y Representación Legal, Cámara de Comercio de Cali, verificación 08264BJBC4",
    verificationStatus: "CHAMBER_CERTIFICATE_CONFIRMED",
    verifiedAt: "2026-08-05",
    notes: null,
  },
  country: {
    sourceType: "INSTITUTIONAL_DOSSIER",
    sourceDescription: "ASODEF institutional dossier",
    verificationStatus: "INSTITUTIONAL_DOSSIER_CONFIRMED",
    verifiedAt: null,
    notes: null,
  },
  corporateEmail: {
    sourceType: "INSTITUTIONAL_DOSSIER",
    sourceDescription: "ASODEF institutional dossier",
    verificationStatus: "INSTITUTIONAL_DOSSIER_CONFIRMED",
    verifiedAt: null,
    notes: null,
  },
  commercialContactName: {
    sourceType: "INSTITUTIONAL_DOSSIER",
    sourceDescription: "ASODEF institutional dossier - commercial contact, not the legal representative",
    verificationStatus: "INSTITUTIONAL_DOSSIER_CONFIRMED",
    verifiedAt: null,
    notes: "Juan Pablo Filigrana is the commercial contact, not automatically the legal representative.",
  },
  commercialContactRole: {
    sourceType: "INSTITUTIONAL_DOSSIER",
    sourceDescription: "ASODEF institutional dossier",
    verificationStatus: "INSTITUTIONAL_DOSSIER_CONFIRMED",
    verifiedAt: null,
    notes: null,
  },
  commercialWhatsApp: {
    sourceType: "INSTITUTIONAL_DOSSIER",
    sourceDescription: "ASODEF institutional dossier",
    verificationStatus: "INSTITUTIONAL_DOSSIER_CONFIRMED",
    verifiedAt: null,
    notes: null,
  },
  addressLine1: {
    sourceType: "PUBLIC_BUSINESS_REGISTRY",
    sourceDescription: "Recent public company-directory information",
    verificationStatus: "PUBLIC_REGISTRY_CORROBORATED",
    verifiedAt: null,
    notes:
      "Corroborated by recent public company-directory information, but not yet verified against a current Certificate of Existence and Legal Representation. Do not classify as CERTIFICATE_VERIFIED.",
  },
};

/**
 * Section 2 requirement: fields that must remain null/pending and must
 * never be inferred from directories, social media, staff names, or
 * commercial contacts. Every entry here is deliberately absent from
 * ASODEF_COMPANY itself - this list exists so the *absence* is
 * documented and traceable, not just silent.
 *
 * US-069 update: legalRepresentativeName, legalRepresentativeDocument,
 * alternateLegalRepresentative, judicialNotificationEmail,
 * registeredPhone, lastRenewalYear, fullCorporatePurpose,
 * certificateIssueDate and certificateVerificationCode are now resolved
 * (see ASODEF_COMPANY above) by the Certificado de Existencia y
 * Representación Legal, verificación 08264BJBC4. Only `shareholders`
 * remains here - not because it is unknown (the same certificate
 * discloses it), but by deliberate policy decision: it is part of the
 * Grupo Empresarial control disclosure (Ley 222 de 1995), a corporate-
 * control fact this config intentionally does not carry as a usable
 * field, to avoid it being pulled into public legal content. See
 * US-069's acceptance criteria for the explicit record of this decision.
 */
export const ASODEF_PENDING_CORPORATE_FIELDS = {
  shareholders: null,
} as const;

export const PENDING_CORPORATE_FIELD_STATUS: CorporateFieldVerificationStatus = "PENDING_CURRENT_CHAMBER_CERTIFICATE";
