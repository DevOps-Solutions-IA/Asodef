import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DataSubjectRequestStatus } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";
import { AuditService, AuditSource } from "../audit/audit.service";
import { RateLimiterService } from "../auth/rate-limiter.service";
import { RateLimitedException, type RequestContext } from "../auth/auth.service";
import type { EnvConfig } from "../../config/env.validation";
import { generatePublicReference } from "../payment-orders/public-reference";
import { ConsentService } from "../consent/consent.service";
import { LegalDocumentsService } from "../legal-documents/legal-documents.service";
import type { CreateDataSubjectRequestDto } from "./dto/create-data-subject-request.dto";
import type { TransitionDataSubjectRequestDto } from "./dto/transition-data-subject-request.dto";
import type { AssignDataSubjectRequestDto } from "./dto/assign-data-subject-request.dto";
import type { ListDataSubjectRequestsQueryDto } from "./dto/list-data-subject-requests-query.dto";
import {
  toAdminDataSubjectRequestResponse,
  toPublicDataSubjectRequestResponse,
  type AdminDataSubjectRequestListResponse,
  type AdminDataSubjectRequestResponse,
  type PublicDataSubjectRequestResponse,
} from "./data-subject-request.types";

const GENERIC_NOT_FOUND_MESSAGE = "No se encontraron resultados.";
const DATA_PROCESSING_POLICY_SLUG = "tratamiento-de-datos";

/** Not given explicitly by the AC beyond one negative case (RECEIVED ->
 * RESOLVED directly is invalid) - this table is the mechanical
 * enforcement of that: RESOLVED is only reachable via IN_REVIEW, which
 * itself is only reachable via IDENTITY_VERIFICATION. CLOSED is a
 * terminal state everything but itself can reach; nothing leaves CLOSED. */
const ALLOWED_TRANSITIONS: Record<DataSubjectRequestStatus, readonly DataSubjectRequestStatus[]> = {
  RECEIVED: [
    DataSubjectRequestStatus.IDENTITY_VERIFICATION,
    DataSubjectRequestStatus.REJECTED_WITH_REASON,
    DataSubjectRequestStatus.CLOSED,
  ],
  IDENTITY_VERIFICATION: [
    DataSubjectRequestStatus.IN_REVIEW,
    DataSubjectRequestStatus.INFORMATION_REQUIRED,
    DataSubjectRequestStatus.REJECTED_WITH_REASON,
    DataSubjectRequestStatus.CLOSED,
  ],
  IN_REVIEW: [
    DataSubjectRequestStatus.INFORMATION_REQUIRED,
    DataSubjectRequestStatus.RESOLVED,
    DataSubjectRequestStatus.REJECTED_WITH_REASON,
    DataSubjectRequestStatus.CLOSED,
  ],
  INFORMATION_REQUIRED: [
    DataSubjectRequestStatus.IN_REVIEW,
    DataSubjectRequestStatus.REJECTED_WITH_REASON,
    DataSubjectRequestStatus.CLOSED,
  ],
  RESOLVED: [DataSubjectRequestStatus.CLOSED],
  REJECTED_WITH_REASON: [DataSubjectRequestStatus.CLOSED],
  CLOSED: [],
};

@Injectable()
export class DataSubjectRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly rateLimiterService: RateLimiterService,
    private readonly configService: ConfigService<EnvConfig, true>,
    private readonly legalDocumentsService: LegalDocumentsService,
    private readonly consentService: ConsentService,
  ) {}

  /**
   * Unlike LeadsService's silent-drop anti-spam pattern, a real 429 is
   * used here (caught and re-thrown by the controller, same convention
   * as AuthService.login's RateLimitedException) rather than pretending
   * to accept a habeas-data rights request that was actually dropped -
   * a data subject exercising a real legal right deserves to know their
   * submission wasn't received, unlike a marketing lead.
   */
  async create(dto: CreateDataSubjectRequestDto, context: RequestContext): Promise<PublicDataSubjectRequestResponse> {
    const rateLimit = await this.rateLimiterService.checkAndIncrement(
      `data-subject-requests:ip:${context.ipAddress ?? "unknown"}`,
      this.configService.get("DATA_SUBJECT_REQUESTS_RATE_LIMIT_IP_MAX", { infer: true }),
      this.configService.get("DATA_SUBJECT_REQUESTS_RATE_LIMIT_IP_WINDOW_SECONDS", { infer: true }),
    );
    if (rateLimit.limited) {
      throw new RateLimitedException(rateLimit.retryAfterSeconds);
    }

    return this.prisma.$transaction(async (tx) => {
      const request = await tx.dataSubjectRequest.create({
        data: {
          publicReference: generatePublicReference(),
          type: dto.type,
          requesterName: dto.requesterName,
          requesterEmail: dto.requesterEmail,
          requesterDocument: dto.requesterDocument,
          description: dto.description,
          status: DataSubjectRequestStatus.RECEIVED,
        },
      });

      await this.auditService.record(tx, {
        dataSubjectRequestId: request.id,
        action: "data_subject_request.created",
        previousStatus: null,
        newStatus: request.status,
        applied: true,
        source: AuditSource.REQUEST_CREATE,
      });

      // US-072: the request itself is real personal data (name, email,
      // document number) collected from a public form, with no consent
      // trail until now - anonymous, not a Customer/User/LeadSubmission
      // link, since a data-subject request may come from someone who
      // isn't (yet) any of those; same pattern the cookie-consent
      // banner already uses for an unidentified visitor.
      const policyVersionId = await this.legalDocumentsService.resolveCurrentPublishedVersionId(DATA_PROCESSING_POLICY_SLUG, tx);
      await this.consentService.record(tx, "data_processing", { anonymous: true }, policyVersionId, {
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent ?? null,
        source: "web_data_subject_request_form",
        acceptanceMethod: "form_submission",
      });

      return toPublicDataSubjectRequestResponse(request);
    });
  }

  /** Reference-only, public (AC: "no auth... without exposing other
   * requesters' data") - the publicReference is the only lookup key,
   * unguessable (24 random bytes), same guarantee PaymentOrder's own
   * publicReference already relies on. */
  async findByPublicReference(publicReference: string): Promise<PublicDataSubjectRequestResponse> {
    const request = await this.prisma.dataSubjectRequest.findUnique({ where: { publicReference } });
    if (!request) {
      throw new NotFoundException(GENERIC_NOT_FOUND_MESSAGE);
    }
    return toPublicDataSubjectRequestResponse(request);
  }

  async list(query: ListDataSubjectRequestsQueryDto): Promise<AdminDataSubjectRequestListResponse> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where = query.status ? { status: query.status } : {};

    const [items, total] = await Promise.all([
      this.prisma.dataSubjectRequest.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.dataSubjectRequest.count({ where }),
    ]);

    return { items: items.map(toAdminDataSubjectRequestResponse), total, page, pageSize };
  }

  async findById(id: string): Promise<AdminDataSubjectRequestResponse> {
    const request = await this.prisma.dataSubjectRequest.findUnique({ where: { id } });
    if (!request) {
      throw new NotFoundException(GENERIC_NOT_FOUND_MESSAGE);
    }
    return toAdminDataSubjectRequestResponse(request);
  }

  async assign(id: string, dto: AssignDataSubjectRequestDto, actorUserId: string): Promise<AdminDataSubjectRequestResponse> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.dataSubjectRequest.findUnique({ where: { id } });
      if (!existing) {
        throw new NotFoundException(GENERIC_NOT_FOUND_MESSAGE);
      }

      const updated = await tx.dataSubjectRequest.update({
        where: { id },
        data: { assignedUserId: dto.assignedUserId },
      });

      await this.auditService.record(tx, {
        dataSubjectRequestId: id,
        action: "data_subject_request.assigned",
        previousStatus: existing.status,
        newStatus: updated.status,
        applied: true,
        source: AuditSource.MANUAL,
        actorUserId,
        metadata: { assignedUserId: dto.assignedUserId },
      });

      return toAdminDataSubjectRequestResponse(updated);
    });
  }

  /**
   * Negative case (AC): "transitioning a request straight from RECEIVED
   * to RESOLVED without an identity-verification step recorded is
   * rejected... with a clear validation error" - enforced twice, for
   * two different loopholes: the ALLOWED_TRANSITIONS table alone blocks
   * the literal RECEIVED->RESOLVED jump (RESOLVED is only reachable via
   * IN_REVIEW), and the identityVerificationStatus guard below also
   * blocks the case where a request *did* pass through the
   * IDENTITY_VERIFICATION status label without ever actually recording
   * a verification outcome on that transition. The AC's own wording
   * ("validation error") is honored literally with a 400
   * BadRequestException - a deliberate difference from
   * LegalDocumentsService's 409 ConflictException for its own blocked-
   * transition case, since that story's AC used different wording.
   */
  async transition(id: string, dto: TransitionDataSubjectRequestDto, actorUserId: string): Promise<AdminDataSubjectRequestResponse> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.dataSubjectRequest.findUnique({ where: { id } });
      if (!existing) {
        throw new NotFoundException(GENERIC_NOT_FOUND_MESSAGE);
      }

      const allowedTargets = ALLOWED_TRANSITIONS[existing.status];
      if (!allowedTargets.includes(dto.status)) {
        throw new BadRequestException(`No es posible pasar de "${existing.status}" a "${dto.status}".`);
      }

      if (
        dto.status === DataSubjectRequestStatus.RESOLVED &&
        !existing.identityVerificationStatus &&
        !dto.identityVerificationStatus
      ) {
        throw new BadRequestException(
          "No se puede resolver la solicitud sin un paso de verificación de identidad registrado.",
        );
      }

      const isTerminalOutcome =
        dto.status === DataSubjectRequestStatus.RESOLVED || dto.status === DataSubjectRequestStatus.REJECTED_WITH_REASON;

      const updated = await tx.dataSubjectRequest.update({
        where: { id },
        data: {
          status: dto.status,
          identityVerificationStatus: dto.identityVerificationStatus ?? existing.identityVerificationStatus,
          resolution: isTerminalOutcome ? (dto.resolution ?? dto.notes) : existing.resolution,
        },
      });

      await this.auditService.record(tx, {
        dataSubjectRequestId: id,
        action: "data_subject_request.status_changed",
        previousStatus: existing.status,
        newStatus: dto.status,
        applied: true,
        source: AuditSource.MANUAL,
        actorUserId,
        metadata: { notes: dto.notes },
      });

      return toAdminDataSubjectRequestResponse(updated);
    });
  }
}
