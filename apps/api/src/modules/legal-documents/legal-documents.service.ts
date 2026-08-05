import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { LegalDocumentVersionStatus, type Prisma } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";
import { AuditService, AuditSource } from "../audit/audit.service";
import type { CreateLegalDocumentDto } from "./dto/create-legal-document.dto";
import type { CreateLegalDocumentVersionDto } from "./dto/create-legal-document-version.dto";
import type { UpdateLegalDocumentVersionDto } from "./dto/update-legal-document-version.dto";
import {
  toAdminVersionResponse,
  toPublicLegalDocumentResponse,
  type AdminLegalDocumentResponse,
  type AdminLegalDocumentVersionResponse,
  type PublicLegalDocumentResponse,
} from "./legal-document.types";

const GENERIC_NOT_FOUND_MESSAGE = "No se encontraron resultados.";
const REVIEW_STATUSES: readonly LegalDocumentVersionStatus[] = [
  LegalDocumentVersionStatus.LEGAL_REVIEW,
  LegalDocumentVersionStatus.PENDING_APPROVAL,
];

@Injectable()
export class LegalDocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  /** Creates a brand-new LegalDocument (a document *type* slot) with its
   * first DRAFT version (version 1). */
  async createDocument(actorUserId: string, dto: CreateLegalDocumentDto): Promise<AdminLegalDocumentResponse> {
    return this.prisma.$transaction(async (tx) => {
      const document = await tx.legalDocument.create({
        data: { type: dto.type, title: dto.title, slug: dto.slug },
      });

      const version = await tx.legalDocumentVersion.create({
        data: {
          legalDocumentId: document.id,
          version: 1,
          status: LegalDocumentVersionStatus.DRAFT,
          draftContent: dto.draftContent as Prisma.InputJsonValue,
        },
      });

      await this.auditService.record(tx, {
        legalDocumentVersionId: version.id,
        actorUserId,
        action: "legal_document.created",
        previousStatus: null,
        newStatus: version.status,
        applied: true,
        source: AuditSource.MANUAL,
      });

      return { ...document, versions: [toAdminVersionResponse(version)] };
    });
  }

  /** Adds a new DRAFT version to an existing LegalDocument - version
   * numbers are allocated under a row lock on the parent document, so
   * two concurrent calls can never compute the same next version
   * (the @@unique([legalDocumentId, version]) constraint is the last-
   * resort guarantee; the lock is what prevents either caller from
   * ever *attempting* a collision in the first place). */
  async createVersion(documentId: string, actorUserId: string, dto: CreateLegalDocumentVersionDto): Promise<AdminLegalDocumentVersionResponse> {
    return this.prisma.$transaction(async (tx) => {
      const lockRows = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM legal_documents WHERE id = ${documentId}::uuid FOR UPDATE
      `;
      if (!lockRows[0]) {
        throw new NotFoundException(GENERIC_NOT_FOUND_MESSAGE);
      }

      const latest = await tx.legalDocumentVersion.findFirst({
        where: { legalDocumentId: documentId },
        orderBy: { version: "desc" },
      });
      const nextVersion = (latest?.version ?? 0) + 1;

      const version = await tx.legalDocumentVersion.create({
        data: {
          legalDocumentId: documentId,
          version: nextVersion,
          status: LegalDocumentVersionStatus.DRAFT,
          draftContent: dto.draftContent as Prisma.InputJsonValue,
          changeSummary: dto.changeSummary,
          effectiveDate: dto.effectiveDate ? new Date(dto.effectiveDate) : undefined,
          expirationDate: dto.expirationDate ? new Date(dto.expirationDate) : undefined,
        },
      });

      await this.auditService.record(tx, {
        legalDocumentVersionId: version.id,
        actorUserId,
        action: "legal_document_version.created",
        previousStatus: null,
        newStatus: version.status,
        applied: true,
        source: AuditSource.MANUAL,
      });

      return toAdminVersionResponse(version);
    });
  }

  /** Edits a version's draft content in place - only ever while it is
   * still DRAFT (PRD rule: "draftContent may exist and be edited freely
   * without ever implying public approval", and conversely an
   * APPROVED/PUBLISHED version's content must never mutate). Uses a
   * conditional updateMany (WHERE status = DRAFT) rather than a
   * read-then-write, so a concurrent transition away from DRAFT can
   * never race an in-flight edit into silently succeeding anyway. */
  async updateDraft(versionId: string, actorUserId: string, dto: UpdateLegalDocumentVersionDto): Promise<AdminLegalDocumentVersionResponse> {
    const outcome = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.legalDocumentVersion.findUnique({ where: { id: versionId } });
      if (!existing) {
        throw new NotFoundException(GENERIC_NOT_FOUND_MESSAGE);
      }

      const result = await tx.legalDocumentVersion.updateMany({
        where: { id: versionId, status: LegalDocumentVersionStatus.DRAFT },
        data: {
          draftContent: dto.draftContent as Prisma.InputJsonValue | undefined,
          changeSummary: dto.changeSummary,
          effectiveDate: dto.effectiveDate ? new Date(dto.effectiveDate) : undefined,
          expirationDate: dto.expirationDate ? new Date(dto.expirationDate) : undefined,
        },
      });

      // The ConflictException throw must happen *outside* this
      // transaction (see the class-level doc comment on
      // applyTransition) - throwing it here would roll back the very
      // audit row that is supposed to survive the blocked attempt.
      if (result.count === 0) {
        await this.auditService.record(tx, {
          legalDocumentVersionId: versionId,
          actorUserId,
          action: "legal_document_version.edit_blocked",
          previousStatus: existing.status,
          newStatus: existing.status,
          applied: false,
          source: AuditSource.MANUAL,
        });
        return { blocked: true as const };
      }

      const updated = await tx.legalDocumentVersion.findUniqueOrThrow({ where: { id: versionId } });
      await this.auditService.record(tx, {
        legalDocumentVersionId: versionId,
        actorUserId,
        action: "legal_document_version.edited",
        previousStatus: existing.status,
        newStatus: updated.status,
        applied: true,
        source: AuditSource.MANUAL,
      });

      return { blocked: false as const, version: updated };
    });

    if (outcome.blocked) {
      throw new ConflictException("Solo se puede editar una versión en estado borrador.");
    }
    return toAdminVersionResponse(outcome.version);
  }

  async submitForReview(versionId: string, actorUserId: string): Promise<AdminLegalDocumentVersionResponse> {
    return this.applyTransition(versionId, actorUserId, {
      from: [LegalDocumentVersionStatus.DRAFT],
      to: LegalDocumentVersionStatus.LEGAL_REVIEW,
      action: "legal_document_version.submitted_for_review",
      conflictMessage: "Solo una versión en borrador puede enviarse a revisión legal.",
    });
  }

  async submitForApproval(versionId: string, actorUserId: string): Promise<AdminLegalDocumentVersionResponse> {
    return this.applyTransition(versionId, actorUserId, {
      from: [LegalDocumentVersionStatus.LEGAL_REVIEW],
      to: LegalDocumentVersionStatus.PENDING_APPROVAL,
      action: "legal_document_version.submitted_for_approval",
      conflictMessage: "Solo una versión en revisión legal puede enviarse a aprobación.",
    });
  }

  /** "Rejecting" a version under review sends it back to DRAFT for
   * revision - the literal 7-state enum (DRAFT/LEGAL_REVIEW/
   * PENDING_APPROVAL/APPROVED/PUBLISHED/REPLACED/ARCHIVED) has no
   * separate REJECTED state, so this is the closest faithful behavior
   * without inventing an 8th status the PRD never defined. */
  async reject(versionId: string, actorUserId: string): Promise<AdminLegalDocumentVersionResponse> {
    return this.applyTransition(versionId, actorUserId, {
      from: REVIEW_STATUSES,
      to: LegalDocumentVersionStatus.DRAFT,
      action: "legal_document_version.rejected",
      conflictMessage: "Solo una versión en revisión legal o en aprobación puede rechazarse.",
    });
  }

  /** Approving snapshots draftContent into approvedContent at this
   * exact moment - later draft edits (there won't be any, since the
   * version is no longer DRAFT) can never retroactively change what
   * was actually approved. */
  async approve(versionId: string, actorUserId: string): Promise<AdminLegalDocumentVersionResponse> {
    const outcome = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.legalDocumentVersion.findUnique({ where: { id: versionId } });
      if (!existing) {
        throw new NotFoundException(GENERIC_NOT_FOUND_MESSAGE);
      }

      const now = new Date();
      const result = await tx.legalDocumentVersion.updateMany({
        where: { id: versionId, status: LegalDocumentVersionStatus.PENDING_APPROVAL },
        data: {
          status: LegalDocumentVersionStatus.APPROVED,
          approvedContent: existing.draftContent as Prisma.InputJsonValue,
          approvedByUserId: actorUserId,
          approvalDate: now,
        },
      });

      if (result.count === 0) {
        await this.auditService.record(tx, {
          legalDocumentVersionId: versionId,
          actorUserId,
          action: "legal_document_version.status_transition",
          previousStatus: existing.status,
          newStatus: LegalDocumentVersionStatus.APPROVED,
          applied: false,
          source: AuditSource.MANUAL,
        });
        return { blocked: true as const };
      }

      await this.auditService.record(tx, {
        legalDocumentVersionId: versionId,
        actorUserId,
        action: "legal_document_version.approved",
        previousStatus: existing.status,
        newStatus: LegalDocumentVersionStatus.APPROVED,
        applied: true,
        source: AuditSource.MANUAL,
      });

      const updated = await tx.legalDocumentVersion.findUniqueOrThrow({ where: { id: versionId } });
      return { blocked: false as const, version: updated };
    });

    if (outcome.blocked) {
      throw new ConflictException("Solo una versión pendiente de aprobación puede aprobarse.");
    }
    return toAdminVersionResponse(outcome.version);
  }

  /** Publishing is only permitted from APPROVED (negative case, AC
   * verbatim: DRAFT/PENDING_APPROVAL -> 409, no status change). Marks
   * whatever was the document's previous current (PUBLISHED) version,
   * if any, as REPLACED - never deleted, never silently detached. */
  async publish(versionId: string, actorUserId: string): Promise<AdminLegalDocumentVersionResponse> {
    const outcome = await this.prisma.$transaction(async (tx) => {
      const target = await tx.legalDocumentVersion.findUnique({ where: { id: versionId } });
      if (!target) {
        throw new NotFoundException(GENERIC_NOT_FOUND_MESSAGE);
      }

      // Lock the parent document for the whole publish operation -
      // "concurrent publication must not create two active versions"
      // (PRD rule). A second concurrent publish() for the same
      // document blocks here until the first commits, then re-reads
      // currentVersionId fresh below.
      await tx.$queryRaw`SELECT id FROM legal_documents WHERE id = ${target.legalDocumentId}::uuid FOR UPDATE`;

      if (target.status !== LegalDocumentVersionStatus.APPROVED) {
        await this.auditService.record(tx, {
          legalDocumentVersionId: versionId,
          actorUserId,
          action: "legal_document_version.publish_blocked",
          previousStatus: target.status,
          newStatus: LegalDocumentVersionStatus.PUBLISHED,
          applied: false,
          source: AuditSource.MANUAL,
        });
        return { blocked: true as const };
      }

      const document = await tx.legalDocument.findUniqueOrThrow({ where: { id: target.legalDocumentId } });
      const now = new Date();

      if (document.currentVersionId) {
        await tx.legalDocumentVersion.update({
          where: { id: document.currentVersionId },
          data: { status: LegalDocumentVersionStatus.REPLACED },
        });
        await this.auditService.record(tx, {
          legalDocumentVersionId: document.currentVersionId,
          actorUserId,
          action: "legal_document_version.superseded",
          previousStatus: LegalDocumentVersionStatus.PUBLISHED,
          newStatus: LegalDocumentVersionStatus.REPLACED,
          applied: true,
          source: AuditSource.MANUAL,
        });
      }

      const published = await tx.legalDocumentVersion.update({
        where: { id: versionId },
        data: { status: LegalDocumentVersionStatus.PUBLISHED, publicationDate: now },
      });

      await tx.legalDocument.update({ where: { id: document.id }, data: { currentVersionId: versionId } });

      await this.auditService.record(tx, {
        legalDocumentVersionId: versionId,
        actorUserId,
        action: "legal_document_version.published",
        previousStatus: LegalDocumentVersionStatus.APPROVED,
        newStatus: LegalDocumentVersionStatus.PUBLISHED,
        applied: true,
        source: AuditSource.MANUAL,
      });

      return { blocked: false as const, version: published };
    });

    if (outcome.blocked) {
      throw new ConflictException("Solo una versión aprobada puede publicarse.");
    }
    return toAdminVersionResponse(outcome.version);
  }

  async getDocument(documentId: string): Promise<AdminLegalDocumentResponse> {
    const document = await this.prisma.legalDocument.findUnique({
      where: { id: documentId },
      include: { versions: { orderBy: { version: "desc" } } },
    });
    if (!document) {
      throw new NotFoundException(GENERIC_NOT_FOUND_MESSAGE);
    }
    return { ...document, versions: document.versions.map(toAdminVersionResponse) };
  }

  /** Public read (US-045's own future consumer). Only ever returns a
   * PUBLISHED version whose effectiveDate has already arrived (or has
   * none) - a version can be technically PUBLISHED but scheduled for a
   * future effective date, which must not be publicly visible yet
   * either. Anything else (no document, no current version, or a
   * future-effective one) is the identical generic not-found - no
   * distinction leaked to an unauthenticated caller about *why*. */
  async getPublishedBySlug(slug: string): Promise<PublicLegalDocumentResponse> {
    const document = await this.prisma.legalDocument.findUnique({ where: { slug }, include: { currentVersion: true } });
    const version = document?.currentVersion;

    const isEffectiveNow = version?.effectiveDate == null || version.effectiveDate.getTime() <= Date.now();
    if (!document || !version || version.status !== LegalDocumentVersionStatus.PUBLISHED || !isEffectiveNow) {
      throw new NotFoundException(GENERIC_NOT_FOUND_MESSAGE);
    }

    return toPublicLegalDocumentResponse(document.slug, document.type, document.title, version);
  }

  /**
   * The ConflictException in every blocked branch across this service
   * is deliberately thrown *outside* the $transaction callback, never
   * inside it: a throw inside a Prisma interactive transaction rolls
   * back everything written so far in that transaction - including the
   * applied:false audit row that is supposed to be the one durable
   * record of the blocked attempt (PRD: "still logs an audit entry
   * indicating no-op, not silence"). Each transaction instead returns a
   * plain { blocked, ... } result once it has fully committed
   * (audit row included either way), and only the caller decides
   * whether to throw based on that already-durable outcome.
   */
  private async applyTransition(
    versionId: string,
    actorUserId: string,
    options: { from: readonly LegalDocumentVersionStatus[]; to: LegalDocumentVersionStatus; action: string; conflictMessage: string },
  ): Promise<AdminLegalDocumentVersionResponse> {
    const outcome = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.legalDocumentVersion.findUnique({ where: { id: versionId } });
      if (!existing) {
        throw new NotFoundException(GENERIC_NOT_FOUND_MESSAGE);
      }

      const result = await tx.legalDocumentVersion.updateMany({
        where: { id: versionId, status: { in: options.from as LegalDocumentVersionStatus[] } },
        data: { status: options.to },
      });

      if (result.count === 0) {
        await this.auditService.record(tx, {
          legalDocumentVersionId: versionId,
          actorUserId,
          action: options.action,
          previousStatus: existing.status,
          newStatus: options.to,
          applied: false,
          source: AuditSource.MANUAL,
        });
        return { blocked: true as const };
      }

      await this.auditService.record(tx, {
        legalDocumentVersionId: versionId,
        actorUserId,
        action: options.action,
        previousStatus: existing.status,
        newStatus: options.to,
        applied: true,
        source: AuditSource.MANUAL,
      });

      const updated = await tx.legalDocumentVersion.findUniqueOrThrow({ where: { id: versionId } });
      return { blocked: false as const, version: updated };
    });

    if (outcome.blocked) {
      throw new ConflictException(options.conflictMessage);
    }
    return toAdminVersionResponse(outcome.version);
  }
}
