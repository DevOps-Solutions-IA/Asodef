import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";
import { LeadStatus } from "@prisma/client";

const SORT_FIELDS = ["createdAt", "fullName", "company", "status"] as const;
export type LeadSortField = (typeof SORT_FIELDS)[number];

export class ListLeadsQueryDto {
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
  @IsIn(Object.values(LeadStatus))
  status?: LeadStatus;

  @IsOptional()
  @IsIn(["promoted", "pending"])
  promotion?: "promoted" | "pending";

  @IsOptional()
  @IsIn(SORT_FIELDS)
  sortBy?: LeadSortField;

  @IsOptional()
  @IsIn(["asc", "desc"])
  sortOrder?: "asc" | "desc";
}
