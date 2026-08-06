import { apiClient } from "../api-client";

export type GuidedAudience = "person" | "affiliate" | "company" | "ally" | "orientation";
export interface GuidedLeadRequest {
  audience: GuidedAudience;
  need: string;
  fullName: string;
  email: string;
  phone?: string;
  company?: string;
  taxId?: string;
  role?: string;
  city?: string;
  message: string;
  preferredContact: "email" | "whatsapp" | "phone";
  dataProcessingConsent: true;
  commercialConsent?: boolean;
  emailConsent?: boolean;
  whatsappConsent?: boolean;
  idempotencyKey: string;
  entryRoute: string;
  campaign?: Record<string, string>;
  website?: string;
}
export interface GuidedLeadResponse { reference: string; createdAt: string; status: "received" }
export function submitGuidedLead(request: GuidedLeadRequest) { return apiClient.post<GuidedLeadResponse>("/leads/guided", request); }
