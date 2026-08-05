import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { BusinessPartner } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";
import type { CreateBusinessPartnerDto } from "./dto/create-business-partner.dto";
import type { UpdateBusinessPartnerChecksDto } from "./dto/update-business-partner-checks.dto";
import {
  toAdminBusinessPartnerResponse,
  toPublicBusinessPartnerResponse,
  type AdminBusinessPartnerResponse,
  type PublicBusinessPartnerResponse,
} from "./partners.types";

const GENERIC_NOT_FOUND_MESSAGE = "No se encontraron resultados.";

/** Maps each gate-check DB column to the human label the 409 response
 * names when that check is missing (AC's negative case: "the API
 * response names that specific missing validation"). */
const GATE_CHECKS: ReadonlyArray<{ field: keyof BusinessPartner; label: string }> = [
  { field: "legalValidationConfirmed", label: "validación legal" },
  { field: "commercialValidationConfirmed", label: "validación comercial" },
  { field: "benefitConfirmed", label: "confirmación de beneficios" },
  { field: "agreementValidityConfirmed", label: "confirmación de vigencia del acuerdo" },
  { field: "logoAuthorizationConfirmed", label: "autorización del logo" },
  { field: "contactConfirmed", label: "confirmación de contacto" },
  { field: "coverageConfirmed", label: "confirmación de cobertura" },
];

@Injectable()
export class PartnersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateBusinessPartnerDto): Promise<AdminBusinessPartnerResponse> {
    const partner = await this.prisma.businessPartner.create({
      data: {
        legalName: dto.legalName,
        tradeName: dto.tradeName,
        nit: dto.nit,
        sector: dto.sector,
        city: dto.city,
        address: dto.address,
        phone: dto.phone,
        corporateEmail: dto.corporateEmail,
        website: dto.website,
        legalRepresentative: dto.legalRepresentative,
        commercialContactId: dto.commercialContactId,
        agreementType: dto.agreementType,
        benefitsOffered: dto.benefitsOffered as object,
        discountConditions: dto.discountConditions,
        geographicCoverage: dto.geographicCoverage,
        validFrom: dto.validFrom ? new Date(dto.validFrom) : undefined,
        validUntil: dto.validUntil ? new Date(dto.validUntil) : undefined,
        logoPath: dto.logoPath,
        internalNotes: dto.internalNotes,
      },
    });

    return toAdminBusinessPartnerResponse(partner);
  }

  async findById(id: string): Promise<AdminBusinessPartnerResponse> {
    const partner = await this.prisma.businessPartner.findUnique({ where: { id } });
    if (!partner) {
      throw new NotFoundException(GENERIC_NOT_FOUND_MESSAGE);
    }
    return toAdminBusinessPartnerResponse(partner);
  }

  async list(): Promise<AdminBusinessPartnerResponse[]> {
    const partners = await this.prisma.businessPartner.findMany({ orderBy: { createdAt: "desc" } });
    return partners.map(toAdminBusinessPartnerResponse);
  }

  async updateChecks(id: string, dto: UpdateBusinessPartnerChecksDto): Promise<AdminBusinessPartnerResponse> {
    const existing = await this.prisma.businessPartner.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(GENERIC_NOT_FOUND_MESSAGE);
    }

    const updated = await this.prisma.businessPartner.update({ where: { id }, data: { ...dto } });
    return toAdminBusinessPartnerResponse(updated);
  }

  /**
   * Example (AC): all 7 checks true -> publish succeeds, publicationStatus
   * becomes "PUBLISHED", and the partner then appears via listPublic().
   * Negative case (AC): any single missing check -> 409 naming exactly
   * that missing validation (not just a generic "incomplete" message).
   */
  async publish(id: string): Promise<AdminBusinessPartnerResponse> {
    const partner = await this.prisma.businessPartner.findUnique({ where: { id } });
    if (!partner) {
      throw new NotFoundException(GENERIC_NOT_FOUND_MESSAGE);
    }

    const missing = GATE_CHECKS.filter((check) => partner[check.field] !== true).map((check) => check.label);
    if (missing.length > 0) {
      throw new ConflictException(`No se puede publicar: faltan las siguientes validaciones: ${missing.join(", ")}.`);
    }

    const updated = await this.prisma.businessPartner.update({ where: { id }, data: { publicationStatus: "PUBLISHED" } });
    return toAdminBusinessPartnerResponse(updated);
  }

  async listPublic(): Promise<PublicBusinessPartnerResponse[]> {
    const partners = await this.prisma.businessPartner.findMany({
      where: { publicationStatus: "PUBLISHED" },
      orderBy: { tradeName: "asc" },
    });
    return partners.map(toPublicBusinessPartnerResponse);
  }
}
