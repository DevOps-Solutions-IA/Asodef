import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { CommercialPipelineStage, Prisma, ProspectType } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";
import { AuditService, AuditSource } from "../audit/audit.service";
import type { PromoteLeadDto } from "./dto/promote-lead.dto";
import type { CreateOpportunityDto } from "./dto/create-opportunity.dto";
import type { ChangeOpportunityStageDto } from "./dto/change-opportunity-stage.dto";
import type { ScheduleCommercialActivityDto } from "./dto/schedule-commercial-activity.dto";
import type { CreateProposalDto } from "./dto/create-proposal.dto";
import type { CreateAgreementDto } from "./dto/create-agreement.dto";
import type { ListProspectsQueryDto } from "./dto/list-prospects-query.dto";
import type { ListLeadsQueryDto } from "./dto/list-leads-query.dto";
import type { ListOpportunitiesQueryDto } from "./dto/list-opportunities-query.dto";
import type { PaginatedResponse } from "../../common/types/paginated-response.type";
import type { RequestContext } from "../auth/auth.service";
import { AdminBusinessIdempotencyService } from "../../common/idempotency/admin-business-idempotency.service";
import type { AssignOwnerDto } from "./dto/assign-owner.dto";
import type { OpportunityTimelineQueryDto } from "./dto/opportunity-timeline-query.dto";
import {
  toAdminAgreementResponse,
  toAdminCommercialActivityResponse,
  toAdminLeadSubmissionResponse,
  toAdminOpportunityResponse,
  toAdminOpportunityStatusHistoryResponse,
  toAdminProposalResponse,
  toAdminProspectResponse,
  type AdminAgreementResponse,
  type AdminCommercialActivityResponse,
  type AdminLeadSubmissionResponse,
  type AdminOpportunityResponse,
  type AdminOpportunityStageChangeResponse,
  type AdminOpportunityStatusHistoryResponse,
  type AdminProposalResponse,
  type AdminProspectResponse,
  type AdminOpportunityTimelineItem,
  type AdminOpportunityTimelineResponse,
} from "./crm.types";

/** The AC's negative case only allows creating an Agreement once the
 * opportunity has reached one of these two stages. */
const AGREEMENT_ELIGIBLE_STAGES: readonly CommercialPipelineStage[] = [
  CommercialPipelineStage.CONTRACT_PENDING,
  CommercialPipelineStage.ACTIVE_PARTNER,
];

const GENERIC_NOT_FOUND_MESSAGE = "No se encontraron resultados.";

/** The primary, linear funnel (AC's own verbatim order, stages 0-9) -
 * used only to detect forward-skipped stages for the warning flag
 * (AC's own negative case). The 4 trailing side/terminal states
 * (inactive/lost_opportunity/renewal_pending/contract_expired) are
 * deliberately excluded: a transition into or out of one of them never
 * triggers this specific warning, since they aren't part of a single
 * linear sequence a "skip" is measured against. */
const PRIMARY_PIPELINE_ORDER: readonly CommercialPipelineStage[] = [
  CommercialPipelineStage.NEW_PROSPECT,
  CommercialPipelineStage.CONTACTED,
  CommercialPipelineStage.QUALIFIED,
  CommercialPipelineStage.COMMERCIAL_MEETING,
  CommercialPipelineStage.PROPOSAL_PREPARATION,
  CommercialPipelineStage.PROPOSAL_SUBMITTED,
  CommercialPipelineStage.NEGOTIATION,
  CommercialPipelineStage.LEGAL_REVIEW,
  CommercialPipelineStage.CONTRACT_PENDING,
  CommercialPipelineStage.ACTIVE_PARTNER,
];

function detectSkippedStages(from: CommercialPipelineStage, to: CommercialPipelineStage): CommercialPipelineStage[] {
  const fromIndex = PRIMARY_PIPELINE_ORDER.indexOf(from);
  const toIndex = PRIMARY_PIPELINE_ORDER.indexOf(to);
  if (fromIndex === -1 || toIndex === -1 || toIndex <= fromIndex + 1) {
    return [];
  }
  return PRIMARY_PIPELINE_ORDER.slice(fromIndex + 1, toIndex);
}

@Injectable()
export class CrmService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly adminIdempotency: AdminBusinessIdempotencyService,
  ) {}

  /**
   * AC: "Existing LeadSubmission rows can be promoted into a Prospect
   * (linking prospectId)". type/documentOrNit are required explicit
   * input - LeadSubmission never collects either, so nothing is
   * guessed. fullNameOrLegalName/sector/city/source default from the
   * lead's own data when not overridden.
   */
  async promoteLead(leadId: string, dto: PromoteLeadDto, _actorUserId: string): Promise<AdminProspectResponse> {
    return this.prisma.$transaction(async (tx) => {
      const lead = await tx.leadSubmission.findUnique({ where: { id: leadId } });
      if (!lead) {
        throw new NotFoundException(GENERIC_NOT_FOUND_MESSAGE);
      }
      if (lead.prospectId) {
        throw new ConflictException("Este lead ya fue promovido a un prospecto.");
      }

      const prospect = await tx.prospect.create({
        data: {
          type: dto.type,
          fullNameOrLegalName: dto.fullNameOrLegalName ?? (dto.type === ProspectType.COMPANY ? lead.company : lead.fullName),
          documentOrNit: dto.documentOrNit,
          sector: dto.sector ?? lead.sector,
          city: dto.city ?? lead.city,
          source: dto.source ?? "lead_submission",
          assignedUserId: dto.assignedUserId,
        },
      });

      await tx.leadSubmission.update({ where: { id: leadId }, data: { prospectId: prospect.id } });

      return toAdminProspectResponse(prospect);
    });
  }

  async getProspect(id: string): Promise<AdminProspectResponse> {
    const prospect = await this.prisma.prospect.findUnique({ where: { id } });
    if (!prospect) {
      throw new NotFoundException(GENERIC_NOT_FOUND_MESSAGE);
    }
    return toAdminProspectResponse(prospect);
  }

  async assignProspect(id: string, dto: AssignOwnerDto): Promise<AdminProspectResponse> {
    await this.assertAssignableUser(dto.assignedUserId);
    const existing = await this.prisma.prospect.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(GENERIC_NOT_FOUND_MESSAGE);
    const changed = await this.prisma.prospect.updateMany({
      where: { id, updatedAt: new Date(dto.expectedUpdatedAt) },
      data: { assignedUserId: dto.assignedUserId },
    });
    if (changed.count === 0) throw new ConflictException("El prospecto fue modificado por otra persona. Recarga e intenta de nuevo.");
    return toAdminProspectResponse(await this.prisma.prospect.findUniqueOrThrow({ where: { id } }));
  }

  async listProspects(query: ListProspectsQueryDto): Promise<PaginatedResponse<AdminProspectResponse>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const search = query.search?.trim();
    const where: Prisma.ProspectWhereInput = {
      stage: query.stage,
      type: query.type,
      assignedUserId: query.assignedUserId,
      ...(search
        ? {
            OR: [
              { fullNameOrLegalName: { contains: search, mode: "insensitive" } },
              { documentOrNit: { contains: search, mode: "insensitive" } },
              { sector: { contains: search, mode: "insensitive" } },
              { city: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const sortBy = query.sortBy ?? "createdAt";
    const sortOrder = query.sortOrder ?? "desc";
    const orderBy = [{ [sortBy]: sortOrder }, { id: "asc" }] as Prisma.ProspectOrderByWithRelationInput[];
    const [prospects, total] = await Promise.all([
      this.prisma.prospect.findMany({ where, orderBy, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.prospect.count({ where }),
    ]);
    return { items: prospects.map(toAdminProspectResponse), total, page, pageSize };
  }

  /** US-061: /admin/crm/prospectos lists Prospects and LeadSubmissions
   * side by side - this is the LeadSubmission half. */
  async listLeads(query: ListLeadsQueryDto): Promise<PaginatedResponse<AdminLeadSubmissionResponse>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const search = query.search?.trim();
    const where: Prisma.LeadSubmissionWhereInput = {
      status: query.status,
      ...(query.promotion === "promoted" ? { prospectId: { not: null } } : query.promotion === "pending" ? { prospectId: null } : {}),
      ...(search
        ? {
            OR: [
              { fullName: { contains: search, mode: "insensitive" } },
              { company: { contains: search, mode: "insensitive" } },
              { email: { contains: search, mode: "insensitive" } },
              { city: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const sortBy = query.sortBy ?? "createdAt";
    const sortOrder = query.sortOrder ?? "desc";
    const orderBy = [{ [sortBy]: sortOrder }, { id: "asc" }] as Prisma.LeadSubmissionOrderByWithRelationInput[];
    const [leads, total] = await Promise.all([
      this.prisma.leadSubmission.findMany({ where, orderBy, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.leadSubmission.count({ where }),
    ]);
    return { items: leads.map(toAdminLeadSubmissionResponse), total, page, pageSize };
  }

  /**
   * No OpportunityStatusHistory or AuditLog entry is written here -
   * the AC's own Example counts exactly one history row for
   * "promoting a lead... creating an Opportunity... and moving it to
   * qualified", meaning creation itself produces none; only an actual
   * stage *change* via changeStage() does.
   */
  async createOpportunity(prospectId: string, dto: CreateOpportunityDto, actorUserId: string, context: RequestContext): Promise<AdminOpportunityResponse> {
    return this.prisma.$transaction(async (tx) => {
      const prospect = await tx.prospect.findUnique({ where: { id: prospectId } });
      if (!prospect) throw new NotFoundException(GENERIC_NOT_FOUND_MESSAGE);

      const opportunity = await tx.opportunity.create({
        data: {
          prospectId,
          companyId: dto.companyId,
          assignedUserId: dto.assignedUserId,
          stage: dto.stage ?? CommercialPipelineStage.NEW_PROSPECT,
          estimatedValueCents: dto.estimatedValueCents,
          proposedBenefit: dto.proposedBenefit,
          expectedClosingDate: dto.expectedClosingDate ? new Date(dto.expectedClosingDate) : undefined,
          probability: dto.probability,
        },
      });
      await this.auditService.record(tx, {
        opportunityId: opportunity.id,
        actorUserId,
        action: "opportunity.created",
        previousStatus: null,
        newStatus: opportunity.stage,
        applied: true,
        source: AuditSource.MANUAL,
        ...this.auditContext(context),
        metadata: { prospectId, companyId: opportunity.companyId, assignedUserId: opportunity.assignedUserId },
      });
      return toAdminOpportunityResponse(opportunity);
    });
  }

  async getOpportunity(id: string): Promise<AdminOpportunityResponse> {
    const opportunity = await this.prisma.opportunity.findUnique({ where: { id } });
    if (!opportunity) {
      throw new NotFoundException(GENERIC_NOT_FOUND_MESSAGE);
    }
    return toAdminOpportunityResponse(opportunity);
  }

  async assignOpportunity(id: string, dto: AssignOwnerDto, actorUserId: string, context: RequestContext): Promise<AdminOpportunityResponse> {
    await this.assertAssignableUser(dto.assignedUserId);
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.opportunity.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException(GENERIC_NOT_FOUND_MESSAGE);
      const changed = await tx.opportunity.updateMany({ where: { id, updatedAt: new Date(dto.expectedUpdatedAt) }, data: { assignedUserId: dto.assignedUserId } });
      if (changed.count === 0) throw new ConflictException("La oportunidad fue modificada por otra persona. Recarga e intenta de nuevo.");
      const updated = await tx.opportunity.findUniqueOrThrow({ where: { id } });
      await this.auditService.record(tx, {
        opportunityId: id, actorUserId, action: "opportunity.assignment_changed", previousStatus: existing.stage, newStatus: updated.stage,
        applied: true, source: AuditSource.MANUAL, ...this.auditContext(context),
        metadata: { before: { assignedUserId: existing.assignedUserId }, after: { assignedUserId: updated.assignedUserId } },
      });
      return toAdminOpportunityResponse(updated);
    });
  }

  async listOpportunities(query: ListOpportunitiesQueryDto): Promise<PaginatedResponse<AdminOpportunityResponse>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const search = query.search?.trim();
    const where: Prisma.OpportunityWhereInput = {
      stage: query.stage,
      assignedUserId: query.assignedUserId,
      companyId: query.companyId,
      prospectId: query.prospectId,
      ...(search
        ? {
            OR: [
              { proposedBenefit: { contains: search, mode: "insensitive" } },
              { prospect: { fullNameOrLegalName: { contains: search, mode: "insensitive" } } },
              { prospect: { documentOrNit: { contains: search, mode: "insensitive" } } },
              { company: { name: { contains: search, mode: "insensitive" } } },
            ],
          }
        : {}),
    };
    const sortBy = query.sortBy ?? "createdAt";
    const sortOrder = query.sortOrder ?? "desc";
    const orderBy = [{ [sortBy]: sortOrder }, { id: "asc" }] as Prisma.OpportunityOrderByWithRelationInput[];
    const [opportunities, total] = await Promise.all([
      this.prisma.opportunity.findMany({ where, orderBy, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.opportunity.count({ where }),
    ]);
    return { items: opportunities.map(toAdminOpportunityResponse), total, page, pageSize };
  }

  /**
   * Negative case (AC): every stage value is accepted - "allowed at the
   * data layer" - never rejected by an allowed-transitions table (a
   * deliberate departure from US-048/US-050's own transition guards,
   * since this story's AC explicitly asks for a warning, not a
   * rejection). Always writes exactly one OpportunityStatusHistory row
   * and one AuditLog entry, regardless of whether stages were skipped.
   */
  async changeStage(id: string, dto: ChangeOpportunityStageDto, actorUserId: string, context: RequestContext): Promise<AdminOpportunityStageChangeResponse> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.opportunity.findUnique({ where: { id } });
      if (!existing) {
        throw new NotFoundException(GENERIC_NOT_FOUND_MESSAGE);
      }

      if (dto.expectedUpdatedAt) {
        const changed = await tx.opportunity.updateMany({
          where: { id, updatedAt: new Date(dto.expectedUpdatedAt) },
          data: { stage: dto.stage },
        });
        if (changed.count === 0) {
          throw new ConflictException("La oportunidad fue modificada por otra persona. Recarga e intenta de nuevo.");
        }
      } else {
        await tx.opportunity.update({ where: { id }, data: { stage: dto.stage } });
      }
      const updated = await tx.opportunity.findUniqueOrThrow({ where: { id } });

      await tx.opportunityStatusHistory.create({
        data: {
          opportunityId: id,
          fromStage: existing.stage,
          toStage: dto.stage,
          changedByUserId: actorUserId,
          note: dto.note,
        },
      });

      await this.auditService.record(tx, {
        opportunityId: id,
        action: "opportunity.stage_changed",
        previousStatus: existing.stage,
        newStatus: dto.stage,
        applied: true,
        source: AuditSource.MANUAL,
        actorUserId,
        ...this.auditContext(context),
        metadata: { note: dto.note ?? null, expectedUpdatedAt: dto.expectedUpdatedAt ?? null },
      });

      const skippedStages = detectSkippedStages(existing.stage, dto.stage);
      const warning =
        skippedStages.length > 0
          ? `Esta transición omite las siguientes etapas del embudo principal: ${skippedStages.join(", ")}.`
          : null;

      return { ...toAdminOpportunityResponse(updated), warning };
    });
  }

  /** US-061: opportunity detail's "full status history" requirement. */
  async listStatusHistory(opportunityId: string): Promise<AdminOpportunityStatusHistoryResponse[]> {
    const opportunity = await this.prisma.opportunity.findUnique({ where: { id: opportunityId } });
    if (!opportunity) {
      throw new NotFoundException(GENERIC_NOT_FOUND_MESSAGE);
    }
    const history = await this.prisma.opportunityStatusHistory.findMany({
      where: { opportunityId },
      orderBy: { createdAt: "desc" },
    });
    return history.map(toAdminOpportunityStatusHistoryResponse);
  }

  async getTimeline(opportunityId: string, query: OpportunityTimelineQueryDto): Promise<AdminOpportunityTimelineResponse> {
    const exists = await this.prisma.opportunity.count({ where: { id: opportunityId } });
    if (exists === 0) throw new NotFoundException(GENERIC_NOT_FOUND_MESSAGE);
    const take = query.pageSize;
    const [history, activities, proposals, agreements, audits, historyCount, activityCount, proposalCount, agreementCount, auditCount] = await Promise.all([
      this.prisma.opportunityStatusHistory.findMany({ where: { opportunityId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take }),
      this.prisma.commercialActivity.findMany({ where: { opportunityId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take }),
      this.prisma.proposal.findMany({ where: { opportunityId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take }),
      this.prisma.agreement.findMany({ where: { opportunityId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take }),
      this.prisma.auditLog.findMany({ where: { opportunityId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take }),
      this.prisma.opportunityStatusHistory.count({ where: { opportunityId } }),
      this.prisma.commercialActivity.count({ where: { opportunityId } }),
      this.prisma.proposal.count({ where: { opportunityId } }),
      this.prisma.agreement.count({ where: { opportunityId } }),
      this.prisma.auditLog.count({ where: { opportunityId } }),
    ]);
    const items: AdminOpportunityTimelineItem[] = [
      ...history.map((entry) => ({ id: entry.id, kind: "STAGE_CHANGE" as const, occurredAt: entry.createdAt, title: `${entry.fromStage ?? "—"} → ${entry.toStage}`, detail: { note: entry.note }, actorUserId: entry.changedByUserId })),
      ...activities.map((activity) => ({ id: activity.id, kind: "ACTIVITY" as const, occurredAt: activity.createdAt, title: `${activity.type}${activity.completedAt ? " · completada" : " · pendiente"}`, detail: { note: activity.note, dueDate: activity.dueDate, completedAt: activity.completedAt, assignedUserId: activity.assignedUserId }, actorUserId: null })),
      ...proposals.map((proposal) => ({ id: proposal.id, kind: "PROPOSAL" as const, occurredAt: proposal.createdAt, title: `Propuesta v${proposal.version} · ${proposal.status}`, detail: { sentAt: proposal.sentAt }, actorUserId: null })),
      ...agreements.map((agreement) => ({ id: agreement.id, kind: "AGREEMENT" as const, occurredAt: agreement.createdAt, title: `Acuerdo · ${agreement.status ?? "sin estado"}`, detail: { companyId: agreement.companyId, signedDate: agreement.signedDate }, actorUserId: null })),
      ...audits.map((audit) => ({ id: audit.id, kind: "AUDIT" as const, occurredAt: audit.createdAt, title: audit.action, detail: { result: audit.result, metadata: audit.metadata, requestId: audit.requestId, correlationId: audit.correlationId }, actorUserId: audit.actorUserId })),
    ];
    items.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime() || a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id));
    return { items: items.slice(0, take), total: historyCount + activityCount + proposalCount + agreementCount + auditCount, pageSize: take };
  }

  /** US-061: opportunity detail's "activities" requirement. */
  async listActivities(opportunityId: string): Promise<AdminCommercialActivityResponse[]> {
    const opportunity = await this.prisma.opportunity.findUnique({ where: { id: opportunityId } });
    if (!opportunity) {
      throw new NotFoundException(GENERIC_NOT_FOUND_MESSAGE);
    }
    const activities = await this.prisma.commercialActivity.findMany({
      where: { opportunityId },
      orderBy: { createdAt: "desc" },
    });
    return activities.map(toAdminCommercialActivityResponse);
  }

  async scheduleActivity(opportunityId: string, dto: ScheduleCommercialActivityDto, actorUserId: string, context: RequestContext): Promise<AdminCommercialActivityResponse> {
    return this.prisma.$transaction(async (tx) => {
      const opportunity = await tx.opportunity.findUnique({ where: { id: opportunityId } });
      if (!opportunity) throw new NotFoundException(GENERIC_NOT_FOUND_MESSAGE);
      const activity = await tx.commercialActivity.create({
        data: { opportunityId, type: dto.type, dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined, assignedUserId: dto.assignedUserId, note: dto.note },
      });
      await this.auditService.record(tx, {
        opportunityId, actorUserId, action: "commercial_activity.created", previousStatus: null, newStatus: "PENDING",
        applied: true, source: AuditSource.MANUAL, ...this.auditContext(context),
        metadata: { activityId: activity.id, type: activity.type, assignedUserId: activity.assignedUserId },
      });
      return toAdminCommercialActivityResponse(activity);
    });
  }

  async completeActivity(id: string, actorUserId: string, context: RequestContext): Promise<AdminCommercialActivityResponse> {
    return this.prisma.$transaction(async (tx) => {
      const activity = await tx.commercialActivity.findUnique({ where: { id } });
      if (!activity) throw new NotFoundException(GENERIC_NOT_FOUND_MESSAGE);
      const changed = await tx.commercialActivity.updateMany({ where: { id, completedAt: null }, data: { completedAt: new Date() } });
      if (changed.count === 0) throw new ConflictException("Esta actividad ya fue completada.");
      const updated = await tx.commercialActivity.findUniqueOrThrow({ where: { id } });
      await this.auditService.record(tx, {
        opportunityId: activity.opportunityId, actorUserId, action: "commercial_activity.completed", previousStatus: "PENDING", newStatus: "COMPLETED",
        applied: true, source: AuditSource.MANUAL, ...this.auditContext(context), metadata: { activityId: id },
      });
      return toAdminCommercialActivityResponse(updated);
    });
  }

  /**
   * Example (AC): "creating two Proposal versions for the same
   * opportunity preserves both, with the latest flagged as current" -
   * version is a per-opportunity auto-incrementing integer computed
   * inside the transaction (max existing version + 1), never client-
   * supplied, so concurrent creates can't collide on the same number.
   */
  async createProposal(opportunityId: string, dto: CreateProposalDto, actorUserId: string, context: RequestContext, idempotencyKey?: string): Promise<AdminProposalResponse> {
    return this.adminIdempotency.execute({ actorUserId, operation: "crm.proposal.create", key: idempotencyKey, payload: { opportunityId, dto }, work: async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT id FROM opportunities WHERE id = ${opportunityId}::uuid FOR UPDATE`);
      if (locked.length === 0) throw new NotFoundException(GENERIC_NOT_FOUND_MESSAGE);

      const latest = await tx.proposal.findFirst({ where: { opportunityId }, orderBy: { version: "desc" } });
      const nextVersion = (latest?.version ?? 0) + 1;

      const proposal = await tx.proposal.create({
        data: {
          opportunityId,
          version: nextVersion,
          content: dto.content as Prisma.InputJsonValue,
          status: dto.status,
          sentAt: dto.sentAt ? new Date(dto.sentAt) : undefined,
        },
      });

      await this.auditService.record(tx, {
        opportunityId, actorUserId, action: "proposal.created", previousStatus: null, newStatus: proposal.status,
        applied: true, source: AuditSource.MANUAL, ...this.auditContext(context), metadata: { proposalId: proposal.id, version: proposal.version },
      });

      return toAdminProposalResponse(proposal, nextVersion);
    }});
  }

  async listProposals(opportunityId: string): Promise<AdminProposalResponse[]> {
    const proposals = await this.prisma.proposal.findMany({ where: { opportunityId }, orderBy: { version: "desc" } });
    const maxVersion = proposals.reduce((max, p) => Math.max(max, p.version), 0);
    return proposals.map((proposal) => toAdminProposalResponse(proposal, maxVersion));
  }

  /**
   * Negative case (AC): an opportunity still in qualified (before
   * legal_review) is rejected with 409 and a clear stage-requirement
   * message - only contract_pending/active_partner are eligible.
   */
  async createAgreement(opportunityId: string, dto: CreateAgreementDto, actorUserId: string, context: RequestContext, idempotencyKey?: string): Promise<AdminAgreementResponse> {
    return this.adminIdempotency.execute({ actorUserId, operation: "crm.agreement.create", key: idempotencyKey, payload: { opportunityId, dto }, work: async (tx) => {
      const opportunity = await tx.opportunity.findUnique({ where: { id: opportunityId } });
      if (!opportunity) throw new NotFoundException(GENERIC_NOT_FOUND_MESSAGE);
      if (!AGREEMENT_ELIGIBLE_STAGES.includes(opportunity.stage)) {
        throw new ConflictException(`No se puede crear un acuerdo mientras la oportunidad esté en la etapa "${opportunity.stage}". Debe estar en contract_pending o active_partner.`);
      }
      const agreement = await tx.agreement.create({
        data: { opportunityId, companyId: dto.companyId, status: dto.status, signedDate: dto.signedDate ? new Date(dto.signedDate) : undefined },
      });
      await this.auditService.record(tx, {
        opportunityId, actorUserId, action: "agreement.created", previousStatus: null, newStatus: agreement.status,
        applied: true, source: AuditSource.MANUAL, ...this.auditContext(context), metadata: { agreementId: agreement.id, companyId: agreement.companyId },
      });
      return toAdminAgreementResponse(agreement);
    }});
  }

  async listAgreements(opportunityId: string): Promise<AdminAgreementResponse[]> {
    const agreements = await this.prisma.agreement.findMany({ where: { opportunityId }, orderBy: { createdAt: "desc" } });
    return agreements.map(toAdminAgreementResponse);
  }

  private auditContext(context: RequestContext) {
    return {
      requestId: context.requestId ?? undefined,
      correlationId: context.correlationId ?? undefined,
      ipAddress: context.ipAddress ?? undefined,
      userAgent: context.userAgent ?? undefined,
    };
  }

  private async assertAssignableUser(userId: string | null): Promise<void> {
    if (userId === null) return;
    const user = await this.prisma.user.findFirst({ where: { id: userId, status: "ACTIVE" }, select: { id: true } });
    if (!user) throw new NotFoundException("El usuario asignado no existe o no está activo.");
  }
}
