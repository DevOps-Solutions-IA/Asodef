import type { LeadSubmission } from "@prisma/client";

/** Public-safe shape returned by POST /leads: exactly what the visitor
 * themselves just submitted, echoed back as confirmation - never the
 * internal database id, never the honeypot field, never anything the
 * visitor didn't already know. */
export interface LeadSubmissionResponse {
  nombreCompleto: string;
  empresa: string;
  cargo: string;
  ciudad: string;
  telefono: string;
  correo: string;
  sector: string;
  mensaje: string;
  consentAccepted: boolean;
  createdAt: Date;
}

export function toLeadSubmissionResponse(lead: LeadSubmission): LeadSubmissionResponse {
  return {
    nombreCompleto: lead.fullName,
    empresa: lead.company,
    cargo: lead.position,
    ciudad: lead.city,
    telefono: lead.phone,
    correo: lead.email,
    sector: lead.sector,
    mensaje: lead.message,
    consentAccepted: lead.consentAccepted,
    createdAt: lead.createdAt,
  };
}

export interface GuidedLeadResponse {
  reference: string;
  createdAt: Date;
  status: "received";
}

export function toGuidedLeadResponse(lead: LeadSubmission): GuidedLeadResponse {
  return { reference: lead.publicReference ?? "", createdAt: lead.createdAt, status: "received" };
}
