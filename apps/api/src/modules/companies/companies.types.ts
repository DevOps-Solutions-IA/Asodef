import type { CommercialContact, Company, CompanySite } from "@prisma/client";

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

export interface AdminCompanyContactResponse {
  id: string;
  fullName: string;
  role: string | null;
  phone: string | null;
  email: string | null;
  isPrimary: boolean;
}

export function toAdminCompanyContactResponse(contact: CommercialContact): AdminCompanyContactResponse {
  return { id: contact.id, fullName: contact.fullName, role: contact.role, phone: contact.phone, email: contact.email, isPrimary: contact.isPrimary };
}

export interface AdminCompanySiteResponse {
  id: string;
  companyId: string;
  name: string;
  address: string;
  city: string;
  phone: string | null;
  isPrimary: boolean;
  createdAt: Date;
}

export function toAdminCompanySiteResponse(site: CompanySite): AdminCompanySiteResponse {
  return { id: site.id, companyId: site.companyId, name: site.name, address: site.address, city: site.city, phone: site.phone, isPrimary: site.isPrimary, createdAt: site.createdAt };
}
