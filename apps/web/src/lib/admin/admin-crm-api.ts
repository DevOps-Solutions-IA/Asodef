import { apiClient } from "../api-client";
import type {
  AdminAgreement,
  AdminBusinessPartner,
  AdminCommercialActivity,
  AdminCompany,
  AdminCompanyDetail,
  AdminCompanyContact,
  AdminCompanySite,
  AdminLeadSubmission,
  AdminOpportunity,
  AdminOpportunityStageChangeResult,
  AdminOpportunityStatusHistoryEntry,
  AdminOpportunityTimeline,
  AdminProposal,
  AdminProspect,
  BusinessListFilters,
  PaginatedResult,
} from "./admin-crm-types";

function withQuery(path: string, filters: BusinessListFilters = {}): string {
  const query = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== "") query.set(key, String(value));
  });
  const suffix = query.toString();
  return suffix ? `${path}?${suffix}` : path;
}

export function listProspects(filters: BusinessListFilters = {}, signal?: AbortSignal): Promise<PaginatedResult<AdminProspect>> {
  return apiClient.get<PaginatedResult<AdminProspect>>(withQuery("/admin/prospects", filters), { signal });
}

export function listLeads(filters: BusinessListFilters = {}, signal?: AbortSignal): Promise<PaginatedResult<AdminLeadSubmission>> {
  return apiClient.get<PaginatedResult<AdminLeadSubmission>>(withQuery("/admin/leads", filters), { signal });
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

export function listOpportunities(filters: BusinessListFilters = {}, signal?: AbortSignal): Promise<PaginatedResult<AdminOpportunity>> {
  return apiClient.get<PaginatedResult<AdminOpportunity>>(withQuery("/admin/opportunities", filters), { signal });
}

export function getOpportunity(opportunityId: string, signal?: AbortSignal): Promise<AdminOpportunity> {
  return apiClient.get<AdminOpportunity>(`/admin/opportunities/${opportunityId}`, { signal });
}

export function changeOpportunityStage(opportunityId: string, stage: string, expectedUpdatedAt: string, note?: string): Promise<AdminOpportunityStageChangeResult> {
  return apiClient.post<AdminOpportunityStageChangeResult>(`/admin/opportunities/${opportunityId}/stage`, { stage, note, expectedUpdatedAt });
}

export function listOpportunityStatusHistory(opportunityId: string, signal?: AbortSignal): Promise<AdminOpportunityStatusHistoryEntry[]> {
  return apiClient.get<AdminOpportunityStatusHistoryEntry[]>(`/admin/opportunities/${opportunityId}/status-history`, { signal });
}

export function getOpportunityTimeline(opportunityId: string, signal?: AbortSignal): Promise<AdminOpportunityTimeline> {
  return apiClient.get<AdminOpportunityTimeline>(`/admin/opportunities/${opportunityId}/timeline?pageSize=50`, { signal });
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
  return apiClient.post<AdminProposal>(`/admin/opportunities/${opportunityId}/proposals`, { content }, { headers: { "Idempotency-Key": crypto.randomUUID() } });
}

export function listAgreements(opportunityId: string, signal?: AbortSignal): Promise<AdminAgreement[]> {
  return apiClient.get<AdminAgreement[]>(`/admin/opportunities/${opportunityId}/agreements`, { signal });
}

export function createAgreement(opportunityId: string, companyId: string): Promise<AdminAgreement> {
  return apiClient.post<AdminAgreement>(`/admin/opportunities/${opportunityId}/agreement`, { companyId }, { headers: { "Idempotency-Key": crypto.randomUUID() } });
}

export function listCompanies(filters: BusinessListFilters = {}, signal?: AbortSignal): Promise<PaginatedResult<AdminCompany>> {
  return apiClient.get<PaginatedResult<AdminCompany>>(withQuery("/admin/companies", filters), { signal });
}

export function getCompany(companyId: string, signal?: AbortSignal): Promise<AdminCompanyDetail> {
  return apiClient.get<AdminCompanyDetail>(`/admin/companies/${companyId}`, { signal });
}

export function listCompanyContacts(companyId: string, signal?: AbortSignal): Promise<AdminCompanyContact[]> {
  return apiClient.get<AdminCompanyContact[]>(`/admin/companies/${companyId}/contacts`, { signal });
}

export function listCompanySites(companyId: string, signal?: AbortSignal): Promise<AdminCompanySite[]> {
  return apiClient.get<AdminCompanySite[]>(`/admin/companies/${companyId}/sites`, { signal });
}

export interface CreateCompanyPayload {
  name: string;
  nit: string;
  contactName: string;
  contactEmail: string;
  sector: string;
}

export function createCompany(payload: CreateCompanyPayload): Promise<AdminCompany> {
  return apiClient.post<AdminCompany>("/admin/companies", payload);
}

export function listBusinessPartners(filters: BusinessListFilters = {}, signal?: AbortSignal): Promise<PaginatedResult<AdminBusinessPartner>> {
  return apiClient.get<PaginatedResult<AdminBusinessPartner>>(withQuery("/admin/partners", filters), { signal });
}

export function getBusinessPartner(partnerId: string, signal?: AbortSignal): Promise<AdminBusinessPartner> {
  return apiClient.get<AdminBusinessPartner>(`/admin/partners/${partnerId}`, { signal });
}

export function updateBusinessPartnerChecks(partnerId: string, checks: Partial<Record<string, boolean>>, expectedUpdatedAt: string): Promise<AdminBusinessPartner> {
  return apiClient.patch<AdminBusinessPartner>(`/admin/partners/${partnerId}/checks`, { ...checks, expectedUpdatedAt });
}

export function publishBusinessPartner(partnerId: string, expectedUpdatedAt: string): Promise<AdminBusinessPartner> {
  return apiClient.post<AdminBusinessPartner>(`/admin/partners/${partnerId}/publish`, { expectedUpdatedAt });
}
