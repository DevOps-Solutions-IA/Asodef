import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

const SORT_FIELDS = ["createdAt", "updatedAt", "tradeName", "legalName", "status", "publicationStatus"] as const;
export type BusinessPartnerSortField = (typeof SORT_FIELDS)[number];

export class ListBusinessPartnersQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number;
  @IsOptional() @IsString() @MaxLength(120) search?: string;
  @IsOptional() @IsString() @MaxLength(50) status?: string;
  @IsOptional() @IsString() @MaxLength(50) publicationStatus?: string;
  @IsOptional() @IsString() @MaxLength(80) sector?: string;
  @IsOptional() @IsString() @MaxLength(80) city?: string;
  @IsOptional() @IsIn(SORT_FIELDS) sortBy?: BusinessPartnerSortField;
  @IsOptional() @IsIn(["asc", "desc"]) sortOrder?: "asc" | "desc";
}
