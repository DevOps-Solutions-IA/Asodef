import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditSource } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";
import { AuditService } from "../audit/audit.service";
import type { CreateCompanyDto } from "./dto/create-company.dto";
import { toAdminCompanyResponse, type AdminCompanyDetailResponse, type AdminCompanyResponse } from "./companies.types";

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

  async list(): Promise<AdminCompanyResponse[]> {
    const companies = await this.prisma.company.findMany({ orderBy: { createdAt: "desc" } });
    return companies.map(toAdminCompanyResponse);
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
}
