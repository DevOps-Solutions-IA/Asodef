import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditSource, Prisma } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";
import { AuditService } from "../audit/audit.service";
import type { CreateCompanyDto } from "./dto/create-company.dto";
import type { ListCompaniesQueryDto } from "./dto/list-companies-query.dto";
import type { CreateCompanyContactDto } from "./dto/create-company-contact.dto";
import type { CreateCompanySiteDto } from "./dto/create-company-site.dto";
import type { PaginatedResponse } from "../../common/types/paginated-response.type";
import { toAdminCompanyContactResponse, toAdminCompanyResponse, toAdminCompanySiteResponse, type AdminCompanyContactResponse, type AdminCompanyDetailResponse, type AdminCompanyResponse, type AdminCompanySiteResponse } from "./companies.types";

const GENERIC_NOT_FOUND_MESSAGE = "No se encontraron resultados.";

/** Strips everything but digits and a trailing check-digit hyphen (the
 * Colombian NIT convention, e.g. "900.552.882-2" -> "900552882-2") -
 * this is what the uniqueness check and the stored value both use, so
 * "900552882-2" and "900.552.882-2" are treated as the same NIT. */
function normalizeNit(raw: string): string {
  return raw.replace(/[^0-9-]/g, "");
}

@Injectable()
export class CompaniesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * US-074: the write path this module never had (see the AdminCompanyResponse
   * doc comment this closes: "nothing in this codebase creates a Company row
   * yet"). NIT is normalized before both the uniqueness check and the stored
   * value, and a duplicate is a clear 409 - never a raw DB constraint error
   * leaking to the caller.
   */
  async create(actorUserId: string, dto: CreateCompanyDto): Promise<AdminCompanyResponse> {
    const nit = normalizeNit(dto.nit);

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.company.findUnique({ where: { nit } });
      if (existing) {
        throw new ConflictException(`Ya existe una empresa registrada con el NIT ${nit}.`);
      }

      const company = await tx.company.create({
        data: {
          name: dto.name,
          nit,
          contactName: dto.contactName,
          contactEmail: dto.contactEmail,
          sector: dto.sector,
          status: dto.status ?? "ACTIVE",
        },
      });

      await this.auditService.record(tx, {
        companyId: company.id,
        actorUserId,
        action: "company.created",
        previousStatus: null,
        newStatus: company.status,
        applied: true,
        source: AuditSource.MANUAL,
      });

      return toAdminCompanyResponse(company);
    });
  }

  async list(query: ListCompaniesQueryDto): Promise<PaginatedResponse<AdminCompanyResponse>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const search = query.search?.trim();
    const where: Prisma.CompanyWhereInput = {
      status: query.status,
      ...(query.sector ? { sector: { equals: query.sector.trim(), mode: "insensitive" } } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { nit: { contains: search, mode: "insensitive" } },
              { contactName: { contains: search, mode: "insensitive" } },
              { contactEmail: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const sortBy = query.sortBy ?? "createdAt";
    const sortOrder = query.sortOrder ?? "desc";
    const orderBy = [{ [sortBy]: sortOrder }, { id: "asc" }] as Prisma.CompanyOrderByWithRelationInput[];
    const [companies, total] = await Promise.all([
      this.prisma.company.findMany({ where, orderBy, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.company.count({ where }),
    ]);
    return { items: companies.map(toAdminCompanyResponse), total, page, pageSize };
  }

  async findById(id: string): Promise<AdminCompanyDetailResponse> {
    const company = await this.prisma.company.findUnique({
      where: { id },
      include: { _count: { select: { opportunities: true, agreements: true, contracts: true } } },
    });
    if (!company) {
      throw new NotFoundException(GENERIC_NOT_FOUND_MESSAGE);
    }
    return {
      ...toAdminCompanyResponse(company),
      opportunityCount: company._count.opportunities,
      agreementCount: company._count.agreements,
      contractCount: company._count.contracts,
    };
  }

  async listContacts(companyId: string): Promise<AdminCompanyContactResponse[]> {
    await this.assertCompany(companyId);
    const contacts = await this.prisma.commercialContact.findMany({ where: { companyId }, orderBy: [{ isPrimary: "desc" }, { fullName: "asc" }, { id: "asc" }] });
    return contacts.map(toAdminCompanyContactResponse);
  }

  async createContact(actorUserId: string, companyId: string, dto: CreateCompanyContactDto): Promise<AdminCompanyContactResponse> {
    return this.prisma.$transaction(async (tx) => {
      const company = await tx.company.findUnique({ where: { id: companyId } });
      if (!company) throw new NotFoundException(GENERIC_NOT_FOUND_MESSAGE);
      if (dto.isPrimary) await tx.commercialContact.updateMany({ where: { companyId, isPrimary: true }, data: { isPrimary: false } });
      const contact = await tx.commercialContact.create({ data: { companyId, fullName: dto.fullName, role: dto.role, phone: dto.phone, email: dto.email, isPrimary: dto.isPrimary ?? false } });
      await this.auditService.record(tx, {
        companyId, actorUserId, action: "company.contact_created", previousStatus: company.status, newStatus: company.status,
        applied: true, source: AuditSource.MANUAL, metadata: { contactId: contact.id, isPrimary: contact.isPrimary },
      });
      return toAdminCompanyContactResponse(contact);
    });
  }

  async listSites(companyId: string): Promise<AdminCompanySiteResponse[]> {
    await this.assertCompany(companyId);
    const sites = await this.prisma.companySite.findMany({ where: { companyId }, orderBy: [{ isPrimary: "desc" }, { name: "asc" }, { id: "asc" }] });
    return sites.map(toAdminCompanySiteResponse);
  }

  async createSite(actorUserId: string, companyId: string, dto: CreateCompanySiteDto): Promise<AdminCompanySiteResponse> {
    return this.prisma.$transaction(async (tx) => {
      const company = await tx.company.findUnique({ where: { id: companyId } });
      if (!company) throw new NotFoundException(GENERIC_NOT_FOUND_MESSAGE);
      if (dto.isPrimary) await tx.companySite.updateMany({ where: { companyId, isPrimary: true }, data: { isPrimary: false } });
      const site = await tx.companySite.create({ data: { companyId, name: dto.name, address: dto.address, city: dto.city, phone: dto.phone, isPrimary: dto.isPrimary ?? false } });
      await this.auditService.record(tx, {
        companyId, actorUserId, action: "company.site_created", previousStatus: company.status, newStatus: company.status,
        applied: true, source: AuditSource.MANUAL, metadata: { siteId: site.id, isPrimary: site.isPrimary },
      });
      return toAdminCompanySiteResponse(site);
    });
  }

  private async assertCompany(id: string): Promise<void> {
    if ((await this.prisma.company.count({ where: { id } })) === 0) throw new NotFoundException(GENERIC_NOT_FOUND_MESSAGE);
  }
}
