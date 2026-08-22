import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, type BusinessPartner } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";
import type { CreateBusinessPartnerDto } from "./dto/create-business-partner.dto";
import type { UpdateBusinessPartnerChecksDto } from "./dto/update-business-partner-checks.dto";
import type { ListBusinessPartnersQueryDto } from "./dto/list-business-partners-query.dto";
import type { PaginatedResponse } from "../../common/types/paginated-response.type";
import type { PublishBusinessPartnerDto } from "./dto/publish-business-partner.dto";
import type { UpsertPartnerContactDto } from "./dto/upsert-partner-contact.dto";
import {
  toAdminBusinessPartnerResponse,
  toPublicBusinessPartnerResponse,
  type AdminBusinessPartnerResponse,
  type PublicBusinessPartnerResponse,
  toAdminPartnerContactResponse,
  type AdminPartnerContactResponse,
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

  async getContact(id: string): Promise<AdminPartnerContactResponse | null> {
    const partner = await this.prisma.businessPartner.findUnique({ where: { id }, include: { commercialContact: true } });
    if (!partner) throw new NotFoundException(GENERIC_NOT_FOUND_MESSAGE);
    return partner.commercialContact ? toAdminPartnerContactResponse(partner.commercialContact) : null;
  }

  async upsertContact(id: string, dto: UpsertPartnerContactDto): Promise<AdminPartnerContactResponse> {
    return this.prisma.$transaction(async (tx) => {
      const partner = await tx.businessPartner.findUnique({ where: { id } });
      if (!partner) throw new NotFoundException(GENERIC_NOT_FOUND_MESSAGE);
      if (partner.updatedAt.getTime() !== new Date(dto.expectedUpdatedAt).getTime()) {
        throw new ConflictException("El aliado fue modificado por otra persona. Recarga e intenta de nuevo.");
      }
      if (partner.commercialContactId) {
        const updated = await tx.commercialContact.update({ where: { id: partner.commercialContactId }, data: { fullName: dto.fullName, role: dto.role, phone: dto.phone, email: dto.email } });
        await tx.businessPartner.updateMany({ where: { id, updatedAt: partner.updatedAt }, data: { contactConfirmed: true } });
        return toAdminPartnerContactResponse(updated);
      }
      const contact = await tx.commercialContact.create({ data: { fullName: dto.fullName, role: dto.role, phone: dto.phone, email: dto.email, isPrimary: true } });
      const linked = await tx.businessPartner.updateMany({ where: { id, updatedAt: partner.updatedAt }, data: { commercialContactId: contact.id, contactConfirmed: true } });
      if (linked.count === 0) throw new ConflictException("El aliado fue modificado por otra persona. Recarga e intenta de nuevo.");
      return toAdminPartnerContactResponse(contact);
    });
  }

  async list(query: ListBusinessPartnersQueryDto): Promise<PaginatedResponse<AdminBusinessPartnerResponse>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const search = query.search?.trim();
    const where: Prisma.BusinessPartnerWhereInput = {
      status: query.status,
      publicationStatus: query.publicationStatus,
      ...(query.sector ? { sector: { equals: query.sector.trim(), mode: "insensitive" } } : {}),
      ...(query.city ? { city: { equals: query.city.trim(), mode: "insensitive" } } : {}),
      ...(search
        ? {
            OR: [
              { tradeName: { contains: search, mode: "insensitive" } },
              { legalName: { contains: search, mode: "insensitive" } },
              { nit: { contains: search, mode: "insensitive" } },
              { corporateEmail: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const sortBy = query.sortBy ?? "createdAt";
    const sortOrder = query.sortOrder ?? "desc";
    const orderBy = [{ [sortBy]: sortOrder }, { id: "asc" }] as Prisma.BusinessPartnerOrderByWithRelationInput[];
    const [partners, total] = await Promise.all([
      this.prisma.businessPartner.findMany({ where, orderBy, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.businessPartner.count({ where }),
    ]);
    return { items: partners.map(toAdminBusinessPartnerResponse), total, page, pageSize };
  }

  async updateChecks(id: string, dto: UpdateBusinessPartnerChecksDto): Promise<AdminBusinessPartnerResponse> {
    const existing = await this.prisma.businessPartner.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(GENERIC_NOT_FOUND_MESSAGE);
    }

    const { expectedUpdatedAt, ...checks } = dto;
    if (expectedUpdatedAt) {
      const changed = await this.prisma.businessPartner.updateMany({ where: { id, updatedAt: new Date(expectedUpdatedAt) }, data: checks });
      if (changed.count === 0) throw new ConflictException("El aliado fue modificado por otra persona. Recarga e intenta de nuevo.");
      return toAdminBusinessPartnerResponse(await this.prisma.businessPartner.findUniqueOrThrow({ where: { id } }));
    }
    return toAdminBusinessPartnerResponse(await this.prisma.businessPartner.update({ where: { id }, data: checks }));
  }

  /**
   * Example (AC): all 7 checks true -> publish succeeds, publicationStatus
   * becomes "PUBLISHED", and the partner then appears via listPublic().
   * Negative case (AC): any single missing check -> 409 naming exactly
   * that missing validation (not just a generic "incomplete" message).
   */
  async publish(id: string, dto: PublishBusinessPartnerDto): Promise<AdminBusinessPartnerResponse> {
    const partner = await this.prisma.businessPartner.findUnique({ where: { id } });
    if (!partner) {
      throw new NotFoundException(GENERIC_NOT_FOUND_MESSAGE);
    }

    const missing = GATE_CHECKS.filter((check) => partner[check.field] !== true).map((check) => check.label);
    if (missing.length > 0) {
      throw new ConflictException(`No se puede publicar: faltan las siguientes validaciones: ${missing.join(", ")}.`);
    }

    if (dto.expectedUpdatedAt) {
      const changed = await this.prisma.businessPartner.updateMany({ where: { id, updatedAt: new Date(dto.expectedUpdatedAt), ...Object.fromEntries(GATE_CHECKS.map(({ field }) => [field, true])) }, data: { publicationStatus: "PUBLISHED" } });
      if (changed.count === 0) throw new ConflictException("El aliado fue modificado por otra persona. Recarga e intenta de nuevo.");
      return toAdminBusinessPartnerResponse(await this.prisma.businessPartner.findUniqueOrThrow({ where: { id } }));
    }
    return toAdminBusinessPartnerResponse(await this.prisma.businessPartner.update({ where: { id }, data: { publicationStatus: "PUBLISHED" } }));
  }

  async listPublic(): Promise<PublicBusinessPartnerResponse[]> {
    const partners = await this.prisma.businessPartner.findMany({
      where: { publicationStatus: "PUBLISHED" },
      orderBy: { tradeName: "asc" },
    });
    return partners.map(toPublicBusinessPartnerResponse);
  }
}
