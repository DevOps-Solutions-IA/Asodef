import { apiClient } from "../api-client";
import type {
  AdminAgreement,
  AdminBusinessPartner,
  AdminCommercialActivity,
  AdminCompany,
  AdminCompanyDetail,
  AdminLeadSubmission,
  AdminOpportunity,
  AdminOpportunityStageChangeResult,
  AdminOpportunityStatusHistoryEntry,
  AdminProposal,
  AdminProspect,
} from "./admin-crm-types";

export function listProspects(signal?: AbortSignal): Promise<AdminProspect[]> {
  return apiClient.get<AdminProspect[]>("/admin/prospects", { signal });
}

export function listLeads(signal?: AbortSignal): Promise<AdminLeadSubmission[]> {
  return apiClient.get<AdminLeadSubmission[]>("/admin/leads", { signal });
}

export interface PromoteLeadInput {
  type: "INDIVIDUAL" | "COMPANY";
  documentOrNit: string;
}

export function promoteLead(leadId: string, input: PromoteLeadInput): Promise<AdminProspect> {
  return apiClient.post<AdminProspect>(`/admin/leads/${leadId}/promote`, input);
}

export function createOpportunity(prospectId: string): Promise<AdminOpportunity> {
  return apiClient.post<AdminOpportunity>(`/admin/prospects/${prospectId}/opportunities`, {});
}

export function listOpportunities(signal?: AbortSignal): Promise<AdminOpportunity[]> {
  return apiClient.get<AdminOpportunity[]>("/admin/opportunities", { signal });
}

export function getOpportunity(opportunityId: string, signal?: AbortSignal): Promise<AdminOpportunity> {
  return apiClient.get<AdminOpportunity>(`/admin/opportunities/${opportunityId}`, { signal });
}

export function changeOpportunityStage(opportunityId: string, stage: string, note?: string): Promise<AdminOpportunityStageChangeResult> {
  return apiClient.post<AdminOpportunityStageChangeResult>(`/admin/opportunities/${opportunityId}/stage`, { stage, note });
}

export function listOpportunityStatusHistory(opportunityId: string, signal?: AbortSignal): Promise<AdminOpportunityStatusHistoryEntry[]> {
  return apiClient.get<AdminOpportunityStatusHistoryEntry[]>(`/admin/opportunities/${opportunityId}/status-history`, { signal });
}

export function listOpportunityActivities(opportunityId: string, signal?: AbortSignal): Promise<AdminCommercialActivity[]> {
  return apiClient.get<AdminCommercialActivity[]>(`/admin/opportunities/${opportunityId}/activities`, { signal });
}

export interface ScheduleActivityInput {
  type: "CALL" | "MEETING" | "EMAIL" | "TASK";
  note?: string;
}

export function scheduleActivity(opportunityId: string, input: ScheduleActivityInput): Promise<AdminCommercialActivity> {
  return apiClient.post<AdminCommercialActivity>(`/admin/opportunities/${opportunityId}/activities`, input);
}

export function completeActivity(activityId: string): Promise<AdminCommercialActivity> {
  return apiClient.post<AdminCommercialActivity>(`/admin/activities/${activityId}/complete`, {});
}

export function listProposals(opportunityId: string, signal?: AbortSignal): Promise<AdminProposal[]> {
  return apiClient.get<AdminProposal[]>(`/admin/opportunities/${opportunityId}/proposals`, { signal });
}

export function createProposal(opportunityId: string, content: Record<string, unknown>): Promise<AdminProposal> {
  return apiClient.post<AdminProposal>(`/admin/opportunities/${opportunityId}/proposals`, { content });
}

export function listAgreements(opportunityId: string, signal?: AbortSignal): Promise<AdminAgreement[]> {
  return apiClient.get<AdminAgreement[]>(`/admin/opportunities/${opportunityId}/agreements`, { signal });
}

export function createAgreement(opportunityId: string, companyId: string): Promise<AdminAgreement> {
  return apiClient.post<AdminAgreement>(`/admin/opportunities/${opportunityId}/agreement`, { companyId });
}

export function listCompanies(signal?: AbortSignal): Promise<AdminCompany[]> {
  return apiClient.get<AdminCompany[]>("/admin/companies", { signal });
}

export function getCompany(companyId: string, signal?: AbortSignal): Promise<AdminCompanyDetail> {
  return apiClient.get<AdminCompanyDetail>(`/admin/companies/${companyId}`, { signal });
}

export function listBusinessPartners(signal?: AbortSignal): Promise<AdminBusinessPartner[]> {
  return apiClient.get<AdminBusinessPartner[]>("/admin/partners", { signal });
}

export function getBusinessPartner(partnerId: string, signal?: AbortSignal): Promise<AdminBusinessPartner> {
  return apiClient.get<AdminBusinessPartner>(`/admin/partners/${partnerId}`, { signal });
}

export function updateBusinessPartnerChecks(partnerId: string, checks: Partial<Record<string, boolean>>): Promise<AdminBusinessPartner> {
  return apiClient.patch<AdminBusinessPartner>(`/admin/partners/${partnerId}/checks`, checks);
}

export function publishBusinessPartner(partnerId: string): Promise<AdminBusinessPartner> {
  return apiClient.post<AdminBusinessPartner>(`/admin/partners/${partnerId}/publish`, {});
}
