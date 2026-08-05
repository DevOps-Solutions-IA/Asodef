import { IsIn, IsInt, IsISO8601, IsOptional, IsString, IsUUID, Min } from "class-validator";
import { CommercialPipelineStage } from "@prisma/client";

const STAGES = Object.values(CommercialPipelineStage);

export class CreateOpportunityDto {
  @IsOptional()
  @IsUUID("4")
  companyId?: string;

  @IsOptional()
  @IsUUID("4")
  assignedUserId?: string;

  @IsOptional()
  @IsIn(STAGES, { message: `stage debe ser uno de: ${STAGES.join(", ")}.` })
  stage?: CommercialPipelineStage;

  @IsOptional()
  @IsInt()
  @Min(0)
  estimatedValueCents?: number;

  @IsOptional()
  @IsString()
  proposedBenefit?: string;

  @IsOptional()
  @IsISO8601()
  expectedClosingDate?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  probability?: number;
}
