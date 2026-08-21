import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from "class-validator";
import { CommercialPipelineStage, ProspectType } from "@prisma/client";

const SORT_FIELDS = ["createdAt", "fullNameOrLegalName", "stage", "updatedAt"] as const;
export type ProspectSortField = (typeof SORT_FIELDS)[number];

export class ListProspectsQueryDto {
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
  @IsIn(Object.values(ProspectType))
  type?: ProspectType;

  @IsOptional()
  @IsUUID()
  assignedUserId?: string;

  @IsOptional()
  @IsIn(SORT_FIELDS)
  sortBy?: ProspectSortField;

  @IsOptional()
  @IsIn(["asc", "desc"])
  sortOrder?: "asc" | "desc";
}
