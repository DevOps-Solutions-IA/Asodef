import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { ConsentStatus, type Prisma } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";
import {
  subjectToRecordFields,
  toAdminConsentRecordResponse,
  toConsentRecordResponse,
  type AdminConsentRecordResponse,
  type ConsentRecordResponse,
  type RecordConsentRequestMeta,
  type RecordConsentSubject,
} from "./consent.types";

export interface SearchConsentRecordsFilters {
  subjectType?: "user" | "leadSubmission" | "customer";
  subjectId?: string;
  purposeKey?: string;
  page?: number;
  pageSize?: number;
}

export interface AdminConsentRecordListResponse {
  items: AdminConsentRecordResponse[];
  total: number;
  page: number;
  pageSize: number;
}

const SUBJECT_TYPE_TO_FIELD = {
  user: "userId",
  leadSubmission: "leadSubmissionId",
  customer: "customerId",
} as const;

/**
 * US-046. Takes the same transaction client every other domain write
 * already goes through (mirrors AuditService.record) - a consent record
 * must commit atomically with whatever it's evidence of (the lead/order
 * it was captured alongside), never as an afterthought that could
 * succeed or fail independently.
 */
@Injectable()
export class ConsentService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Negative case (AC): a purpose that doesn't exist, or a purpose that
   * requires a policy version when none is resolvable, is a validation
   * error (400) - never a silent no-op and never a 500.
   */
  async record(
    tx: Prisma.TransactionClient,
    purposeKey: string,
    subject: RecordConsentSubject,
    policyVersionId: string | null,
    req: RecordConsentRequestMeta,
    status: typeof ConsentStatus.GRANTED | typeof ConsentStatus.DENIED = ConsentStatus.GRANTED,
  ): Promise<ConsentRecordResponse> {
    const purpose = await tx.consentPurpose.findUnique({ where: { key: purposeKey } });
    if (!purpose) {
      throw new BadRequestException(`El propósito de consentimiento "${purposeKey}" no existe.`);
    }

    if (purpose.requiresPolicyVersion && !policyVersionId) {
      throw new BadRequestException(`No se pudo resolver una versión de política vigente para "${purposeKey}".`);
    }

    if (policyVersionId) {
      const version = await tx.legalDocumentVersion.findUnique({ where: { id: policyVersionId } });
      if (!version) {
        throw new BadRequestException(`No se pudo resolver una versión de política vigente para "${purposeKey}".`);
      }
    }

    const record = await tx.consentRecord.create({
      data: {
        consentPurposeId: purpose.id,
        legalDocumentVersionId: policyVersionId,
        ...subjectToRecordFields(subject),
        status,
        ipAddress: req.ipAddress,
        userAgent: req.userAgent,
        source: req.source,
        acceptanceMethod: req.acceptanceMethod,
        metadata: req.metadata as Prisma.InputJsonValue | undefined,
      },
    });

    return toConsentRecordResponse(record, purposeKey);
  }

  /** US-062 AC2: "searching consent records by subject/purpose". Both
   * filters are optional and combine with AND when both given. */
  async search(filters: SearchConsentRecordsFilters): Promise<AdminConsentRecordListResponse> {
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 20;

    const where: Prisma.ConsentRecordWhereInput = {};
    if (filters.subjectType && filters.subjectId) {
      where[SUBJECT_TYPE_TO_FIELD[filters.subjectType]] = filters.subjectId;
    }
    if (filters.purposeKey) {
      where.consentPurpose = { key: filters.purposeKey };
    }

    const [records, total] = await Promise.all([
      this.prisma.consentRecord.findMany({
        where,
        include: { consentPurpose: true, legalDocumentVersion: true },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.consentRecord.count({ where }),
    ]);

    return { items: records.map(toAdminConsentRecordResponse), total, page, pageSize };
  }

  /** US-062 AC2: "viewing full evidence (policy version, ip, timestamp,
   * method)". */
  async getDetail(consentRecordId: string): Promise<AdminConsentRecordResponse> {
    const record = await this.prisma.consentRecord.findUnique({
      where: { id: consentRecordId },
      include: { consentPurpose: true, legalDocumentVersion: true },
    });
    if (!record) {
      throw new NotFoundException("El registro de consentimiento no existe.");
    }
    return toAdminConsentRecordResponse(record);
  }

  async revoke(consentRecordId: string): Promise<ConsentRecordResponse> {
    const record = await this.prisma.consentRecord.findUnique({
      where: { id: consentRecordId },
      include: { consentPurpose: true },
    });
    if (!record) {
      throw new NotFoundException("El registro de consentimiento no existe.");
    }

    const updated = await this.prisma.consentRecord.update({
      where: { id: consentRecordId },
      data: { status: ConsentStatus.REVOKED, revokedAt: new Date() },
    });

    return toConsentRecordResponse(updated, record.consentPurpose.key);
  }
}
