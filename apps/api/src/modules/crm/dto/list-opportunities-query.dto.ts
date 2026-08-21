import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from "class-validator";
import { CommercialPipelineStage } from "@prisma/client";

const SORT_FIELDS = ["createdAt", "updatedAt", "stage", "estimatedValueCents", "expectedClosingDate"] as const;
export type OpportunitySortField = (typeof SORT_FIELDS)[number];

export class ListOpportunitiesQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @IsIn(Object.values(CommercialPipelineStage))
  stage?: CommercialPipelineStage;

  @IsOptional()
  @IsUUID()
  assignedUserId?: string;

  @IsOptional()
  @IsUUID()
  companyId?: string;

  @IsOptional()
  @IsUUID()
  prospectId?: string;

  @IsOptional()
  @IsIn(SORT_FIELDS)
  sortBy?: OpportunitySortField;

  @IsOptional()
  @IsIn(["asc", "desc"])
  sortOrder?: "asc" | "desc";
}
