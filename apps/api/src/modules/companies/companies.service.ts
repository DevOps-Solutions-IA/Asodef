import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service";
import { toAdminCompanyResponse, type AdminCompanyDetailResponse, type AdminCompanyResponse } from "./companies.types";

const GENERIC_NOT_FOUND_MESSAGE = "No se encontraron resultados.";

@Injectable()
export class CompaniesService {
  constructor(private readonly prisma: PrismaService) {}

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
