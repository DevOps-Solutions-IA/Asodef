import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";
import { CompanyStatus } from "@prisma/client";

const SORT_FIELDS = ["createdAt", "name", "nit", "sector", "status"] as const;
export type CompanySortField = (typeof SORT_FIELDS)[number];

export class ListCompaniesQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number;
  @IsOptional() @IsString() @MaxLength(120) search?: string;
  @IsOptional() @IsIn(Object.values(CompanyStatus)) status?: CompanyStatus;
  @IsOptional() @IsString() @MaxLength(80) sector?: string;
  @IsOptional() @IsIn(SORT_FIELDS) sortBy?: CompanySortField;
  @IsOptional() @IsIn(["asc", "desc"]) sortOrder?: "asc" | "desc";
}
