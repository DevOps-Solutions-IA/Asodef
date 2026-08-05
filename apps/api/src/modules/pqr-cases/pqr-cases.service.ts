import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PqrCaseStatus } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";
import { AuditService, AuditSource } from "../audit/audit.service";
import { RateLimiterService } from "../auth/rate-limiter.service";
import { RateLimitedException } from "../auth/auth.service";
import type { EnvConfig } from "../../config/env.validation";
import { generatePublicReference } from "../payment-orders/public-reference";
import type { CreatePqrCaseDto } from "./dto/create-pqr-case.dto";
import type { TransitionPqrCaseDto } from "./dto/transition-pqr-case.dto";
import type { AssignPqrCaseDto } from "./dto/assign-pqr-case.dto";
import type { ListPqrCasesQueryDto } from "./dto/list-pqr-cases-query.dto";
import {
  toAdminPqrCaseResponse,
  toPublicPqrCaseResponse,
  type AdminPqrCaseListResponse,
  type AdminPqrCaseResponse,
  type PublicPqrCaseResponse,
} from "./pqr-case.types";

const GENERIC_NOT_FOUND_MESSAGE = "No se encontraron resultados.";

/** Not given explicitly by the AC beyond one negative case (closing
 * from INFORMATION_REQUIRED without a resolution is invalid) - RECEIVED
 * and REOPENED can also close early (e.g. duplicate/invalid case), same
 * "early rejection without ever fully progressing" allowance
 * DataSubjectRequest's own table has. CLOSED is reachable from every
 * non-terminal status but always requires a resolution (enforced
 * separately below, uniformly - not just from INFORMATION_REQUIRED). */
const ALLOWED_TRANSITIONS: Record<PqrCaseStatus, readonly PqrCaseStatus[]> = {
  RECEIVED: [PqrCaseStatus.ASSIGNED, PqrCaseStatus.CLOSED],
  ASSIGNED: [PqrCaseStatus.IN_REVIEW, PqrCaseStatus.CLOSED],
  IN_REVIEW: [PqrCaseStatus.INFORMATION_REQUIRED, PqrCaseStatus.RESOLVED, PqrCaseStatus.CLOSED],
  INFORMATION_REQUIRED: [PqrCaseStatus.IN_REVIEW, PqrCaseStatus.CLOSED],
  RESOLVED: [PqrCaseStatus.CLOSED, PqrCaseStatus.REOPENED],
  CLOSED: [PqrCaseStatus.REOPENED],
  REOPENED: [PqrCaseStatus.ASSIGNED, PqrCaseStatus.IN_REVIEW, PqrCaseStatus.CLOSED],
};

@Injectable()
export class PqrCasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly rateLimiterService: RateLimiterService,
    private readonly configService: ConfigService<EnvConfig, true>,
  ) {}

  /**
   * Same real-429 convention as US-048's DataSubjectRequestsService,
   * not the leads form's silent-drop anti-spam pattern - a formal
   * complaint/petition deserves to know it wasn't received, unlike a
   * marketing lead.
   *
   * relatedPaymentOrderId is never accepted directly from the public
   * caller - only a payment publicReference, resolved server-side
   * (AC's own Example: "a linked payment reference"). If it resolves,
   * relatedCustomerId is set automatically from that order's own
   * customer, giving a complete link without the anonymous submitter
   * ever needing to know or supply a customer id.
   */
  async create(dto: CreatePqrCaseDto, ipAddress: string | null): Promise<PublicPqrCaseResponse> {
    const rateLimit = await this.rateLimiterService.checkAndIncrement(
      `pqr-cases:ip:${ipAddress ?? "unknown"}`,
      this.configService.get("PQR_CASES_RATE_LIMIT_IP_MAX", { infer: true }),
      this.configService.get("PQR_CASES_RATE_LIMIT_IP_WINDOW_SECONDS", { infer: true }),
    );
    if (rateLimit.limited) {
      throw new RateLimitedException(rateLimit.retryAfterSeconds);
    }

    return this.prisma.$transaction(async (tx) => {
      let relatedPaymentOrderId: string | null = null;
      let relatedCustomerId: string | null = null;
      if (dto.paymentReference) {
        const order = await tx.paymentOrder.findUnique({ where: { publicReference: dto.paymentReference } });
        if (order) {
          relatedPaymentOrderId = order.id;
          relatedCustomerId = order.customerId;
        }
        // An unresolvable reference is never surfaced as an error - the
        // case is still created, just without the link, matching the
        // public reference-lookup convention elsewhere of never
        // confirming/denying details about payment data to an
        // unauthenticated caller.
      }

      const pqrCase = await tx.pqrCase.create({
        data: {
          caseNumber: generatePublicReference(),
          category: dto.category,
          applicantName: dto.applicantName,
          applicantContact: dto.applicantContact,
          description: dto.description,
          relatedPaymentOrderId,
          relatedCustomerId,
          status: PqrCaseStatus.RECEIVED,
        },
      });

      await this.auditService.record(tx, {
        pqrCaseId: pqrCase.id,
        action: "pqr_case.created",
        previousStatus: null,
        newStatus: pqrCase.status,
        applied: true,
        source: AuditSource.REQUEST_CREATE,
      });

      // AC: "case creation triggers a CommunicationLog entry (US-059)
      // acknowledging receipt" - BLOCKED. CommunicationLog is defined
      // by US-059, which itself depends on this story (US-050), so it
      // cannot exist yet. Nothing is invented here in its place.

      return toPublicPqrCaseResponse(pqrCase);
    });
  }

  /** Reference-only, public - never exposes applicantName/
   * applicantContact/internal id to a reference-only lookup. */
  async findByCaseNumber(caseNumber: string): Promise<PublicPqrCaseResponse> {
    const pqrCase = await this.prisma.pqrCase.findUnique({ where: { caseNumber } });
    if (!pqrCase) {
      throw new NotFoundException(GENERIC_NOT_FOUND_MESSAGE);
    }
    return toPublicPqrCaseResponse(pqrCase);
  }

  async list(query: ListPqrCasesQueryDto): Promise<AdminPqrCaseListResponse> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where = query.status ? { status: query.status } : {};

    const [items, total] = await Promise.all([
      this.prisma.pqrCase.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.pqrCase.count({ where }),
    ]);

    return { items: items.map(toAdminPqrCaseResponse), total, page, pageSize };
  }

  async findById(id: string): Promise<AdminPqrCaseResponse> {
    const pqrCase = await this.prisma.pqrCase.findUnique({ where: { id } });
    if (!pqrCase) {
      throw new NotFoundException(GENERIC_NOT_FOUND_MESSAGE);
    }
    return toAdminPqrCaseResponse(pqrCase);
  }

  async assign(id: string, dto: AssignPqrCaseDto, actorUserId: string): Promise<AdminPqrCaseResponse> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.pqrCase.findUnique({ where: { id } });
      if (!existing) {
        throw new NotFoundException(GENERIC_NOT_FOUND_MESSAGE);
      }

      const updated = await tx.pqrCase.update({ where: { id }, data: { assignedTeam: dto.assignedTeam } });

      await this.auditService.record(tx, {
        pqrCaseId: id,
        action: "pqr_case.assigned",
        previousStatus: existing.status,
        newStatus: updated.status,
        applied: true,
        source: AuditSource.MANUAL,
        actorUserId,
        metadata: { assignedTeam: dto.assignedTeam },
      });

      return toAdminPqrCaseResponse(updated);
    });
  }

  /**
   * Negative case (AC): "attempting to close a case still in
   * INFORMATION_REQUIRED without a resolution note returns a
   * validation error" - enforced uniformly for every path reaching
   * CLOSED (not just from INFORMATION_REQUIRED specifically): a case
   * needs a stated resolution before it can be closed, regardless of
   * which status it's closing from.
   */
  async transition(id: string, dto: TransitionPqrCaseDto, actorUserId: string): Promise<AdminPqrCaseResponse> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.pqrCase.findUnique({ where: { id } });
      if (!existing) {
        throw new NotFoundException(GENERIC_NOT_FOUND_MESSAGE);
      }

      const allowedTargets = ALLOWED_TRANSITIONS[existing.status];
      if (!allowedTargets.includes(dto.status)) {
        throw new BadRequestException(`No es posible pasar de "${existing.status}" a "${dto.status}".`);
      }

      if (dto.status === PqrCaseStatus.CLOSED && !existing.resolution && !dto.resolution) {
        throw new BadRequestException("No se puede cerrar el caso sin una nota de resolución.");
      }

      const updated = await tx.pqrCase.update({
        where: { id },
        data: {
          status: dto.status,
          resolution: dto.resolution ?? existing.resolution,
          satisfactionScore: dto.satisfactionScore ?? existing.satisfactionScore,
        },
      });

      await this.auditService.record(tx, {
        pqrCaseId: id,
        action: "pqr_case.status_changed",
        previousStatus: existing.status,
        newStatus: dto.status,
        applied: true,
        source: AuditSource.MANUAL,
        actorUserId,
        metadata: { notes: dto.notes },
      });

      return toAdminPqrCaseResponse(updated);
    });
  }
}
