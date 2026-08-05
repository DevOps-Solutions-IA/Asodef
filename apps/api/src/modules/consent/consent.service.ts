import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { ConsentStatus, type Prisma } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";
import {
  subjectToRecordFields,
  toConsentRecordResponse,
  type ConsentRecordResponse,
  type RecordConsentRequestMeta,
  type RecordConsentSubject,
} from "./consent.types";

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
        status: ConsentStatus.GRANTED,
        ipAddress: req.ipAddress,
        userAgent: req.userAgent,
        source: req.source,
        acceptanceMethod: req.acceptanceMethod,
      },
    });

    return toConsentRecordResponse(record, purposeKey);
  }

  /** Not yet wired to a route (no AC in this story calls for one) - a
   * future admin consent-management story (US-062) is expected to
   * expose this. */
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
