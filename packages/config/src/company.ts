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
} as const;

export type CorporateFieldVerificationStatus =
  | "INSTITUTIONAL_DOSSIER_CONFIRMED"
  | "PUBLIC_REGISTRY_CORROBORATED"
  | "PENDING_CURRENT_CHAMBER_CERTIFICATE";

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
    sourceType: "PUBLIC_BUSINESS_REGISTRY",
    sourceDescription: "Public business-registry sources (NIT 900552882-2)",
    verificationStatus: "PUBLIC_REGISTRY_CORROBORATED",
    verifiedAt: null,
    notes: "Not yet verified against a current Certificate of Existence and Legal Representation.",
  },
  legalForm: {
    sourceType: "PUBLIC_BUSINESS_REGISTRY",
    sourceDescription: "Public business-registry sources",
    verificationStatus: "PUBLIC_REGISTRY_CORROBORATED",
    verifiedAt: null,
    notes: "Not yet verified against a current Certificate of Existence and Legal Representation.",
  },
  chamberOfCommerce: {
    sourceType: "PUBLIC_BUSINESS_REGISTRY",
    sourceDescription: "Public business-registry sources",
    verificationStatus: "PUBLIC_REGISTRY_CORROBORATED",
    verifiedAt: null,
    notes: "Not yet verified against a current Certificate of Existence and Legal Representation.",
  },
  commercialRegistrationNumber: {
    sourceType: "PUBLIC_BUSINESS_REGISTRY",
    sourceDescription: "Public business-registry sources (Matrícula Mercantil 854303)",
    verificationStatus: "PUBLIC_REGISTRY_CORROBORATED",
    verifiedAt: null,
    notes: "Not yet verified against a current Certificate of Existence and Legal Representation.",
  },
  registrationDate: {
    sourceType: "PUBLIC_BUSINESS_REGISTRY",
    sourceDescription: "Public business-registry sources",
    verificationStatus: "PUBLIC_REGISTRY_CORROBORATED",
    verifiedAt: null,
    notes: "Not yet verified against a current Certificate of Existence and Legal Representation.",
  },
  registrationStatus: {
    sourceType: "PUBLIC_BUSINESS_REGISTRY",
    sourceDescription: "Public business-registry sources",
    verificationStatus: "PUBLIC_REGISTRY_CORROBORATED",
    verifiedAt: null,
    notes: "Not yet verified against a current Certificate of Existence and Legal Representation.",
  },
  economicActivityCode: {
    sourceType: "PUBLIC_BUSINESS_REGISTRY",
    sourceDescription: "Public business-registry sources (CIIU 9603)",
    verificationStatus: "PUBLIC_REGISTRY_CORROBORATED",
    verifiedAt: null,
    notes: "Not yet verified against a current Certificate of Existence and Legal Representation.",
  },
  city: {
    sourceType: "INSTITUTIONAL_DOSSIER",
    sourceDescription: "ASODEF institutional dossier",
    verificationStatus: "INSTITUTIONAL_DOSSIER_CONFIRMED",
    verifiedAt: null,
    notes: null,
  },
  department: {
    sourceType: "PUBLIC_BUSINESS_REGISTRY",
    sourceDescription: "Public business-registry sources",
    verificationStatus: "PUBLIC_REGISTRY_CORROBORATED",
    verifiedAt: null,
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
 */
export const ASODEF_PENDING_CORPORATE_FIELDS = {
  legalRepresentativeName: null,
  legalRepresentativeDocument: null,
  alternateLegalRepresentative: null,
  judicialNotificationEmail: null,
  registeredPhone: null,
  lastRenewalYear: null,
  fullCorporatePurpose: null,
  shareholders: null,
  certificateIssueDate: null,
  certificateVerificationCode: null,
} as const;

export const PENDING_CORPORATE_FIELD_STATUS: CorporateFieldVerificationStatus = "PENDING_CURRENT_CHAMBER_CERTIFICATE";
