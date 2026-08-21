export const PIPELINE_STAGES = [
  "NEW_PROSPECT",
  "CONTACTED",
  "QUALIFIED",
  "COMMERCIAL_MEETING",
  "PROPOSAL_PREPARATION",
  "PROPOSAL_SUBMITTED",
  "NEGOTIATION",
  "LEGAL_REVIEW",
  "CONTRACT_PENDING",
  "ACTIVE_PARTNER",
  "INACTIVE",
  "LOST_OPPORTUNITY",
  "RENEWAL_PENDING",
  "CONTRACT_EXPIRED",
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface BusinessListFilters {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
  stage?: string;
  assignedUserId?: string;
  companyId?: string;
  prospectId?: string;
  sector?: string;
  city?: string;
  publicationStatus?: string;
  promotion?: "promoted" | "pending";
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export const PIPELINE_STAGE_LABELS: Record<PipelineStage, string> = {
  NEW_PROSPECT: "Nuevo prospecto",
  CONTACTED: "Contactado",
  QUALIFIED: "Calificado",
  COMMERCIAL_MEETING: "Reunión comercial",
  PROPOSAL_PREPARATION: "Preparación de propuesta",
  PROPOSAL_SUBMITTED: "Propuesta enviada",
  NEGOTIATION: "Negociación",
  LEGAL_REVIEW: "Revisión legal",
  CONTRACT_PENDING: "Contrato pendiente",
  ACTIVE_PARTNER: "Aliado activo",
  INACTIVE: "Inactivo",
  LOST_OPPORTUNITY: "Oportunidad perdida",
  RENEWAL_PENDING: "Renovación pendiente",
  CONTRACT_EXPIRED: "Contrato vencido",
};

export interface AdminProspect {
  id: string;
  type: string;
  fullNameOrLegalName: string;
  documentOrNit: string;
  sector: string | null;
  city: string | null;
  source: string | null;
  assignedUserId: string | null;
  stage: string;
  estimatedValueCents: number | null;
  probability: number | null;
  expectedClosingDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminLeadSubmission {
  id: string;
  fullName: string;
  company: string;
  position: string;
  city: string;
  phone: string;
  email: string;
  sector: string;
  message: string;
  status: string;
  prospectId: string | null;
  createdAt: string;
}

export interface AdminOpportunity {
  id: string;
  prospectId: string;
  companyId: string | null;
  assignedUserId: string | null;
  stage: string;
  estimatedValueCents: number | null;
  proposedBenefit: string | null;
  expectedClosingDate: string | null;
  probability: number | null;
  wonLostReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminOpportunityStageChangeResult extends AdminOpportunity {
  warning: string | null;
}

export interface AdminCommercialActivity {
  id: string;
  opportunityId: string;
  type: string;
  dueDate: string | null;
  completedAt: string | null;
  assignedUserId: string | null;
  note: string | null;
  createdAt: string;
}

export interface AdminOpportunityStatusHistoryEntry {
  id: string;
  opportunityId: string;
  fromStage: string | null;
  toStage: string;
  changedByUserId: string | null;
  note: string | null;
  createdAt: string;
}

export interface AdminOpportunityTimeline {
  items: Array<{ id: string; kind: "STAGE_CHANGE" | "ACTIVITY" | "PROPOSAL" | "AGREEMENT" | "AUDIT"; occurredAt: string; title: string; detail: unknown; actorUserId: string | null }>;
  total: number;
  pageSize: number;
}

export interface AdminProposal {
  id: string;
  opportunityId: string;
  version: number;
  content: unknown;
  status: string;
  sentAt: string | null;
  createdAt: string;
  isCurrent: boolean;
}

export interface AdminAgreement {
  id: string;
  opportunityId: string;
  companyId: string;
  status: string | null;
  signedDate: string | null;
  createdAt: string;
}

export interface AdminCompany {
  id: string;
  name: string;
  nit: string;
  contactName: string;
  contactEmail: string;
  sector: string;
  status: string;
  createdAt: string;
}

export interface AdminCompanyDetail extends AdminCompany {
  opportunityCount: number;
  agreementCount: number;
  contractCount: number;
}

export interface AdminCompanyContact {
  id: string;
  fullName: string;
  role: string | null;
  phone: string | null;
  email: string | null;
  isPrimary: boolean;
}

export interface AdminCompanySite {
  id: string;
  companyId: string;
  name: string;
  address: string;
  city: string;
  phone: string | null;
  isPrimary: boolean;
  createdAt: string;
}

export interface AdminBusinessPartner {
  id: string;
  legalName: string;
  tradeName: string;
  nit: string;
  sector: string;
  city: string;
  address: string;
  phone: string;
  corporateEmail: string;
  website: string | null;
  legalRepresentative: string | null;
  commercialContactId: string | null;
  agreementType: string;
  benefitsOffered: unknown;
  discountConditions: string | null;
  geographicCoverage: string | null;
  validFrom: string | null;
  validUntil: string | null;
  logoPath: string | null;
  status: string;
  approvalStatus: string | null;
  publicationStatus: string;
  internalNotes: string | null;
  legalValidationConfirmed: boolean;
  commercialValidationConfirmed: boolean;
  benefitConfirmed: boolean;
  agreementValidityConfirmed: boolean;
  logoAuthorizationConfirmed: boolean;
  contactConfirmed: boolean;
  coverageConfirmed: boolean;
  createdAt: string;
  updatedAt: string;
}

/** The AC's own literal 7-item gate-check list (US-053) - key order here
 * drives both the checklist UI and its completeness check. */
export const PARTNER_GATE_CHECKS: ReadonlyArray<{ key: keyof AdminBusinessPartner; label: string }> = [
  { key: "legalValidationConfirmed", label: "Validación legal" },
  { key: "commercialValidationConfirmed", label: "Validación comercial" },
  { key: "benefitConfirmed", label: "Confirmación del beneficio" },
  { key: "agreementValidityConfirmed", label: "Confirmación de vigencia del acuerdo" },
  { key: "logoAuthorizationConfirmed", label: "Autorización de logo" },
  { key: "contactConfirmed", label: "Confirmación de contacto" },
  { key: "coverageConfirmed", label: "Confirmación de cobertura" },
];
