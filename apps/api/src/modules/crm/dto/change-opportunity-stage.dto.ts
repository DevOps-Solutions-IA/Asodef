import { IsIn, IsOptional, IsString } from "class-validator";
import { CommercialPipelineStage } from "@prisma/client";

const STAGES = Object.values(CommercialPipelineStage);

/**
 * Negative case (AC): moving directly from new_prospect to
 * active_partner (skipping legal_review/contract_pending) "is allowed
 * at the data layer" - no allowed-transitions table exists here,
 * deliberately, unlike US-048/US-050's own transition guards. Every
 * stage value is accepted; CrmService.changeStage() only ever
 * annotates the response with a warning when stages were skipped, it
 * never rejects.
 */
export class ChangeOpportunityStageDto {
  @IsIn(STAGES, { message: `stage debe ser uno de: ${STAGES.join(", ")}.` })
  stage!: CommercialPipelineStage;

  @IsOptional()
  @IsString()
  note?: string;
}
