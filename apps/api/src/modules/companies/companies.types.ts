import type { Company } from "@prisma/client";

/** US-061: /admin/crm/empresas lists Companies alongside BusinessPartners.
 * Company (unlike BusinessPartner) has no publication gate/benefits data -
 * it represents an affiliated employer organization, not a commercial
 * ally. Nothing in this codebase creates a Company row yet (no story has
 * built that write path), so this list may legitimately be empty until a
 * future story does. */
export interface AdminCompanyResponse {
  id: string;
  name: string;
  nit: string;
  contactName: string;
  contactEmail: string;
  sector: string;
  status: string;
  createdAt: Date;
}

export function toAdminCompanyResponse(company: Company): AdminCompanyResponse {
  return {
    id: company.id,
    name: company.name,
    nit: company.nit,
    contactName: company.contactName,
    contactEmail: company.contactEmail,
    sector: company.sector,
    status: company.status,
    createdAt: company.createdAt,
  };
}

export interface AdminCompanyDetailResponse extends AdminCompanyResponse {
  opportunityCount: number;
  agreementCount: number;
  contractCount: number;
}
