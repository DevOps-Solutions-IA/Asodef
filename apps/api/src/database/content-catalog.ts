/**
 * US-020: the single source of truth for which homepage fields are
 * managed via ContentEntry, and their seeded values. Every entry here
 * must be traceable to already-approved copy - never invented.
 *
 * US-014 reopening + corporate-data update: the statistics figures
 * (8405/54692) and their labels were previously deferred (no verified
 * source existed - see project memory on the original US-014
 * deferral). They're now sourced directly from the ASODEF
 * institutional dossier, supplied with explicit provenance. Numeric
 * values are stored as plain numeric strings (no thousands
 * separators) - the frontend applies Colombian Spanish formatting
 * and drives the count-up animation from the raw number.
 *
 * Pure legal/registry facts (NIT, chamber of commerce, registration
 * number, etc.) are NOT duplicated here - they live in
 * @asodef/config's ASODEF_COMPANY/ASODEF_CORPORATE_FIELD_PROVENANCE,
 * the single source of truth for that data.
 */
export interface ContentCatalogEntry {
  key: string;
  value: string;
  /** Where this value came from - not persisted, just documentation. */
  source: string;
}

const DOSSIER_SOURCE = "ASODEF institutional dossier (corporate-data update, 2026-08-05)";

export const CONTENT_CATALOG: readonly ContentCatalogEntry[] = [
  {
    key: "hero.eyebrow",
    value: "ASODEF · Asociación para el desarrollo familiar",
    source: "Approved Hero copy, US-012 (commit ea6d1c9), apps/web/src/pages/home/HomePage.tsx",
  },

  // institutional.history.*
  {
    key: "institutional.history.origin",
    value: "ASODEF tiene sus orígenes en el fondo de empleados Emssanar y evolucionó hasta constituirse como ASODEF S.A.S. en 2012.",
    source: DOSSIER_SOURCE,
  },
  {
    key: "institutional.history.experienceLabel",
    value: "Más de 20 años",
    source: DOSSIER_SOURCE,
  },
  {
    key: "institutional.history.mainLocation",
    value: "Cali",
    source: DOSSIER_SOURCE,
  },

  // institutional.mission.* / institutional.vision.* - preserving the
  // already-approved copy from AboutSection (US-013), now also
  // DB-hydrated for consistency, not new text.
  {
    key: "institutional.mission.statement",
    value: "Brindar atención y soluciones que aporten al bienestar de las personas, las familias y las organizaciones, actuando con compromiso, respeto y transparencia.",
    source: "Approved About copy, US-013, apps/web/src/pages/home/HomePage.tsx",
  },
  {
    key: "institutional.vision.statement",
    value: "Ser una organización reconocida por su cercanía, confianza y capacidad de generar valor para las familias y las comunidades que acompaña.",
    source: "Approved About copy, US-013, apps/web/src/pages/home/HomePage.tsx",
  },

  // institutional.statistics.* - US-014 reopening
  {
    key: "institutional.statistics.affiliateHolders",
    value: "8405",
    source: DOSSIER_SOURCE,
  },
  {
    key: "institutional.statistics.beneficiaries",
    value: "54692",
    source: DOSSIER_SOURCE,
  },
  {
    key: "institutional.statistics.experienceYearsLabel",
    value: "Más de 20 años",
    source: DOSSIER_SOURCE,
  },
  {
    key: "institutional.statistics.coverageLabel",
    value: "Cobertura nacional",
    source: DOSSIER_SOURCE,
  },
  {
    key: "institutional.statistics.agreementsLabel",
    value: "Red de convenios",
    source: DOSSIER_SOURCE,
  },

  // institutional.valuePillars.*
  { key: "institutional.valuePillars.protection", value: "Protección", source: DOSSIER_SOURCE },
  { key: "institutional.valuePillars.alliances", value: "Alianzas", source: DOSSIER_SOURCE },
  { key: "institutional.valuePillars.wellbeing", value: "Bienestar", source: DOSSIER_SOURCE },
  { key: "institutional.valuePillars.coverage", value: "Cobertura", source: DOSSIER_SOURCE },

  // institutional.services.* - the real service portfolio described in
  // the dossier, including the new agreement categories. No service
  // or promise beyond this literal list.
  { key: "institutional.services.familyFuneralPlan", value: "Plan funerario familiar", source: DOSSIER_SOURCE },
  { key: "institutional.services.lifeInsurance", value: "Seguro de vida", source: DOSSIER_SOURCE },
  { key: "institutional.services.healthAndWellbeing", value: "Salud y bienestar", source: DOSSIER_SOURCE },
  { key: "institutional.services.commercialAgreements", value: "Convenios comerciales", source: DOSSIER_SOURCE },
  { key: "institutional.services.legalAssistance", value: "Asistencia jurídica", source: DOSSIER_SOURCE },
  { key: "institutional.services.mobilityBenefits", value: "Beneficios de movilidad", source: DOSSIER_SOURCE },
  { key: "institutional.services.educationBenefits", value: "Beneficios educativos", source: DOSSIER_SOURCE },
  { key: "institutional.services.veterinary", value: "Servicios veterinarios", source: DOSSIER_SOURCE },
  { key: "institutional.services.supermarkets", value: "Supermercados", source: DOSSIER_SOURCE },
  { key: "institutional.services.restaurants", value: "Restaurantes", source: DOSSIER_SOURCE },
  { key: "institutional.services.gyms", value: "Gimnasios", source: DOSSIER_SOURCE },
  { key: "institutional.services.tourism", value: "Turismo", source: DOSSIER_SOURCE },

  // institutional.partnerBenefits.* - the partner-company value
  // proposition described in the dossier.
  { key: "institutional.partnerBenefits.commercialVisibility", value: "Visibilidad comercial", source: DOSSIER_SOURCE },
  { key: "institutional.partnerBenefits.newCustomerAccess", value: "Acceso a nuevos clientes", source: DOSSIER_SOURCE },
  { key: "institutional.partnerBenefits.permanentPromotion", value: "Promoción permanente", source: DOSSIER_SOURCE },
  { key: "institutional.partnerBenefits.strategicAlliances", value: "Alianzas estratégicas", source: DOSSIER_SOURCE },
  { key: "institutional.partnerBenefits.loyalty", value: "Fidelización", source: DOSSIER_SOURCE },
  { key: "institutional.partnerBenefits.brandPositioning", value: "Posicionamiento de marca", source: DOSSIER_SOURCE },

  // institutional.tagline - already used verbatim in the Footer via
  // ASODEF_COMPANY.tagline; DB-hydrated here too for consistency.
  {
    key: "institutional.tagline",
    value: "Trabajamos pensando en su bienestar.",
    source: "Approved tagline, @asodef/config ASODEF_COMPANY.tagline",
  },

  // contact.commercial.* - same confirmed facts as @asodef/config's
  // ASODEF_COMPANY.commercialContact, exposed as admin-editable
  // content too (distinct copies are acceptable here since this is
  // presentation content, not the legal source of truth).
  { key: "contact.commercial.name", value: "Juan Pablo Filigrana", source: DOSSIER_SOURCE },
  { key: "contact.commercial.role", value: "Director Comercial", source: DOSSIER_SOURCE },
  { key: "contact.commercial.whatsapp", value: "573232733927", source: DOSSIER_SOURCE },
  { key: "contact.commercial.email", value: "info@asodef.com.co", source: DOSSIER_SOURCE },
] as const;
