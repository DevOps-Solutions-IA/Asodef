import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { CommercialPipelineStage, ProspectType } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";
import { AuditService, AuditSource } from "../audit/audit.service";
import type { PromoteLeadDto } from "./dto/promote-lead.dto";
import type { CreateOpportunityDto } from "./dto/create-opportunity.dto";
import type { ChangeOpportunityStageDto } from "./dto/change-opportunity-stage.dto";
import type { ScheduleCommercialActivityDto } from "./dto/schedule-commercial-activity.dto";
import {
  toAdminCommercialActivityResponse,
  toAdminOpportunityResponse,
  toAdminProspectResponse,
  type AdminCommercialActivityResponse,
  type AdminOpportunityResponse,
  type AdminOpportunityStageChangeResponse,
  type AdminProspectResponse,
} from "./crm.types";

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
  ) {}

  /**
   * AC: "Existing LeadSubmission rows can be promoted into a Prospect
   * (linking prospectId)". type/documentOrNit are required explicit
   * input - LeadSubmission never collects either, so nothing is
   * guessed. fullNameOrLegalName/sector/city/source default from the
   * lead's own data when not overridden.
   */
  async promoteLead(leadId: string, dto: PromoteLeadDto): Promise<AdminProspectResponse> {
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

  async listProspects(): Promise<AdminProspectResponse[]> {
    const prospects = await this.prisma.prospect.findMany({ orderBy: { createdAt: "desc" } });
    return prospects.map(toAdminProspectResponse);
  }

  /**
   * No OpportunityStatusHistory or AuditLog entry is written here -
   * the AC's own Example counts exactly one history row for
   * "promoting a lead... creating an Opportunity... and moving it to
   * qualified", meaning creation itself produces none; only an actual
   * stage *change* via changeStage() does.
   */
  async createOpportunity(prospectId: string, dto: CreateOpportunityDto): Promise<AdminOpportunityResponse> {
    const prospect = await this.prisma.prospect.findUnique({ where: { id: prospectId } });
    if (!prospect) {
      throw new NotFoundException(GENERIC_NOT_FOUND_MESSAGE);
    }

    const opportunity = await this.prisma.opportunity.create({
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

    return toAdminOpportunityResponse(opportunity);
  }

  async getOpportunity(id: string): Promise<AdminOpportunityResponse> {
    const opportunity = await this.prisma.opportunity.findUnique({ where: { id } });
    if (!opportunity) {
      throw new NotFoundException(GENERIC_NOT_FOUND_MESSAGE);
    }
    return toAdminOpportunityResponse(opportunity);
  }

  async listOpportunities(): Promise<AdminOpportunityResponse[]> {
    const opportunities = await this.prisma.opportunity.findMany({ orderBy: { createdAt: "desc" } });
    return opportunities.map(toAdminOpportunityResponse);
  }

  /**
   * Negative case (AC): every stage value is accepted - "allowed at the
   * data layer" - never rejected by an allowed-transitions table (a
   * deliberate departure from US-048/US-050's own transition guards,
   * since this story's AC explicitly asks for a warning, not a
   * rejection). Always writes exactly one OpportunityStatusHistory row
   * and one AuditLog entry, regardless of whether stages were skipped.
   */
  async changeStage(id: string, dto: ChangeOpportunityStageDto, actorUserId: string): Promise<AdminOpportunityStageChangeResponse> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.opportunity.findUnique({ where: { id } });
      if (!existing) {
        throw new NotFoundException(GENERIC_NOT_FOUND_MESSAGE);
      }

      const updated = await tx.opportunity.update({ where: { id }, data: { stage: dto.stage } });

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
        metadata: dto.note ? { note: dto.note } : undefined,
      });

      const skippedStages = detectSkippedStages(existing.stage, dto.stage);
      const warning =
        skippedStages.length > 0
          ? `Esta transición omite las siguientes etapas del embudo principal: ${skippedStages.join(", ")}.`
          : null;

      return { ...toAdminOpportunityResponse(updated), warning };
    });
  }

  async scheduleActivity(opportunityId: string, dto: ScheduleCommercialActivityDto): Promise<AdminCommercialActivityResponse> {
    const opportunity = await this.prisma.opportunity.findUnique({ where: { id: opportunityId } });
    if (!opportunity) {
      throw new NotFoundException(GENERIC_NOT_FOUND_MESSAGE);
    }

    const activity = await this.prisma.commercialActivity.create({
      data: {
        opportunityId,
        type: dto.type,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        assignedUserId: dto.assignedUserId,
        note: dto.note,
      },
    });

    return toAdminCommercialActivityResponse(activity);
  }

  async completeActivity(id: string): Promise<AdminCommercialActivityResponse> {
    const activity = await this.prisma.commercialActivity.findUnique({ where: { id } });
    if (!activity) {
      throw new NotFoundException(GENERIC_NOT_FOUND_MESSAGE);
    }
    if (activity.completedAt) {
      throw new ConflictException("Esta actividad ya fue completada.");
    }

    const updated = await this.prisma.commercialActivity.update({ where: { id }, data: { completedAt: new Date() } });
    return toAdminCommercialActivityResponse(updated);
  }
}
