import type { BusinessPartner } from "@prisma/client";

export interface AdminBusinessPartnerResponse {
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
  validFrom: Date | null;
  validUntil: Date | null;
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
  createdAt: Date;
  updatedAt: Date;
}

export function toAdminBusinessPartnerResponse(partner: BusinessPartner): AdminBusinessPartnerResponse {
  return {
    id: partner.id,
    legalName: partner.legalName,
    tradeName: partner.tradeName,
    nit: partner.nit,
    sector: partner.sector,
    city: partner.city,
    address: partner.address,
    phone: partner.phone,
    corporateEmail: partner.corporateEmail,
    website: partner.website,
    legalRepresentative: partner.legalRepresentative,
    commercialContactId: partner.commercialContactId,
    agreementType: partner.agreementType,
    benefitsOffered: partner.benefitsOffered,
    discountConditions: partner.discountConditions,
    geographicCoverage: partner.geographicCoverage,
    validFrom: partner.validFrom,
    validUntil: partner.validUntil,
    logoPath: partner.logoPath,
    status: partner.status,
    approvalStatus: partner.approvalStatus,
    publicationStatus: partner.publicationStatus,
    internalNotes: partner.internalNotes,
    legalValidationConfirmed: partner.legalValidationConfirmed,
    commercialValidationConfirmed: partner.commercialValidationConfirmed,
    benefitConfirmed: partner.benefitConfirmed,
    agreementValidityConfirmed: partner.agreementValidityConfirmed,
    logoAuthorizationConfirmed: partner.logoAuthorizationConfirmed,
    contactConfirmed: partner.contactConfirmed,
    coverageConfirmed: partner.coverageConfirmed,
    createdAt: partner.createdAt,
    updatedAt: partner.updatedAt,
  };
}

/** Public response deliberately excludes legalName, nit, address,
 * phone, corporateEmail, legalRepresentative, internalNotes,
 * approvalStatus, status, commercialContactId, and every gate-check
 * boolean - none of that is safe/relevant to expose to an anonymous
 * site visitor. Only marketing-facing fields are returned. */
export interface PublicBusinessPartnerResponse {
  id: string;
  tradeName: string;
  sector: string;
  city: string;
  website: string | null;
  benefitsOffered: unknown;
  discountConditions: string | null;
  geographicCoverage: string | null;
  logoPath: string | null;
  validFrom: Date | null;
  validUntil: Date | null;
}

export function toPublicBusinessPartnerResponse(partner: BusinessPartner): PublicBusinessPartnerResponse {
  return {
    id: partner.id,
    tradeName: partner.tradeName,
    sector: partner.sector,
    city: partner.city,
    website: partner.website,
    benefitsOffered: partner.benefitsOffered,
    discountConditions: partner.discountConditions,
    geographicCoverage: partner.geographicCoverage,
    logoPath: partner.logoPath,
    validFrom: partner.validFrom,
    validUntil: partner.validUntil,
  };
}
