import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service";
import type { TransitionApprovalGateDto } from "./dto/transition-approval-gate.dto";
import { toAdminApprovalGateResponse, type AdminApprovalGateResponse } from "./approval-gates.types";
import { isProductionPaymentsEnabled } from "./is-production-payments-enabled";

const GENERIC_NOT_FOUND_MESSAGE = "No se encontraron resultados.";

@Injectable()
export class ApprovalGatesService {
  constructor(private readonly prisma: PrismaService) {}

  async listGates(): Promise<AdminApprovalGateResponse[]> {
    const gates = await this.prisma.approvalGate.findMany({ orderBy: { key: "asc" } });
    return gates.map(toAdminApprovalGateResponse);
  }

  async getGate(key: string): Promise<AdminApprovalGateResponse> {
    const gate = await this.prisma.approvalGate.findUnique({ where: { key } });
    if (!gate) {
      throw new NotFoundException(GENERIC_NOT_FOUND_MESSAGE);
    }
    return toAdminApprovalGateResponse(gate);
  }

  /**
   * AC: "each requiring approver, date, and optional supporting
   * document/notes" - applies to every transition, not only APPROVED,
   * since approvedByUserId/approvalDate are the only actor/date fields
   * the PRD's own dataModel provides for this entity.
   */
  async transition(key: string, dto: TransitionApprovalGateDto, actorUserId: string): Promise<AdminApprovalGateResponse> {
    const gate = await this.prisma.approvalGate.findUnique({ where: { key } });
    if (!gate) {
      throw new NotFoundException(GENERIC_NOT_FOUND_MESSAGE);
    }

    const updated = await this.prisma.approvalGate.update({
      where: { key },
      data: {
        status: dto.status,
        approvedByUserId: actorUserId,
        approvalDate: dto.date ? new Date(dto.date) : new Date(),
        supportingDocumentPath: dto.supportingDocumentPath,
        notes: dto.notes,
        expirationDate: dto.expirationDate ? new Date(dto.expirationDate) : undefined,
      },
    });

    return toAdminApprovalGateResponse(updated);
  }

  async isProductionPaymentsEnabled(): Promise<boolean> {
    return isProductionPaymentsEnabled(this.prisma);
  }
}
