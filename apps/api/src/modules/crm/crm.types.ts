import type { Agreement, CommercialActivity, Opportunity, Proposal, Prospect } from "@prisma/client";

export interface AdminProspectResponse {
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
  expectedClosingDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export function toAdminProspectResponse(prospect: Prospect): AdminProspectResponse {
  return {
    id: prospect.id,
    type: prospect.type,
    fullNameOrLegalName: prospect.fullNameOrLegalName,
    documentOrNit: prospect.documentOrNit,
    sector: prospect.sector,
    city: prospect.city,
    source: prospect.source,
    assignedUserId: prospect.assignedUserId,
    stage: prospect.stage,
    estimatedValueCents: prospect.estimatedValueCents,
    probability: prospect.probability,
    expectedClosingDate: prospect.expectedClosingDate,
    createdAt: prospect.createdAt,
    updatedAt: prospect.updatedAt,
  };
}

export interface AdminOpportunityResponse {
  id: string;
  prospectId: string;
  companyId: string | null;
  assignedUserId: string | null;
  stage: string;
  estimatedValueCents: number | null;
  proposedBenefit: string | null;
  expectedClosingDate: Date | null;
  probability: number | null;
  wonLostReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export function toAdminOpportunityResponse(opportunity: Opportunity): AdminOpportunityResponse {
  return {
    id: opportunity.id,
    prospectId: opportunity.prospectId,
    companyId: opportunity.companyId,
    assignedUserId: opportunity.assignedUserId,
    stage: opportunity.stage,
    estimatedValueCents: opportunity.estimatedValueCents,
    proposedBenefit: opportunity.proposedBenefit,
    expectedClosingDate: opportunity.expectedClosingDate,
    probability: opportunity.probability,
    wonLostReason: opportunity.wonLostReason,
    createdAt: opportunity.createdAt,
    updatedAt: opportunity.updatedAt,
  };
}

/** Only the stage-change response carries `warning` - never persisted,
 * computed fresh from the from/to stage pair each time (AC's own
 * negative case: "the API surfaces a warning flag on the response"). */
export interface AdminOpportunityStageChangeResponse extends AdminOpportunityResponse {
  warning: string | null;
}

export interface AdminCommercialActivityResponse {
  id: string;
  opportunityId: string;
  type: string;
  dueDate: Date | null;
  completedAt: Date | null;
  assignedUserId: string | null;
  note: string | null;
  createdAt: Date;
}

export function toAdminCommercialActivityResponse(activity: CommercialActivity): AdminCommercialActivityResponse {
  return {
    id: activity.id,
    opportunityId: activity.opportunityId,
    type: activity.type,
    dueDate: activity.dueDate,
    completedAt: activity.completedAt,
    assignedUserId: activity.assignedUserId,
    note: activity.note,
    createdAt: activity.createdAt,
  };
}

/** `isCurrent` is never persisted - computed each time as "highest
 * version among the opportunity's proposals" (AC's Example: "the
 * latest flagged as current"). */
export interface AdminProposalResponse {
  id: string;
  opportunityId: string;
  version: number;
  content: unknown;
  status: string;
  sentAt: Date | null;
  createdAt: Date;
  isCurrent: boolean;
}

export function toAdminProposalResponse(proposal: Proposal, maxVersion: number): AdminProposalResponse {
  return {
    id: proposal.id,
    opportunityId: proposal.opportunityId,
    version: proposal.version,
    content: proposal.content,
    status: proposal.status,
    sentAt: proposal.sentAt,
    createdAt: proposal.createdAt,
    isCurrent: proposal.version === maxVersion,
  };
}

export interface AdminAgreementResponse {
  id: string;
  opportunityId: string;
  companyId: string;
  status: string | null;
  signedDate: Date | null;
  createdAt: Date;
}

export function toAdminAgreementResponse(agreement: Agreement): AdminAgreementResponse {
  return {
    id: agreement.id,
    opportunityId: agreement.opportunityId,
    companyId: agreement.companyId,
    status: agreement.status,
    signedDate: agreement.signedDate,
    createdAt: agreement.createdAt,
  };
}
