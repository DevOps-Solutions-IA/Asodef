import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, Min } from "class-validator";
import { Type } from "class-transformer";

const SUBJECT_TYPES = ["user", "leadSubmission", "customer"] as const;

export class SearchConsentRecordsQueryDto {
  @IsOptional()
  @IsIn(SUBJECT_TYPES)
  subjectType?: (typeof SUBJECT_TYPES)[number];

  @IsOptional()
  @IsUUID("4")
  subjectId?: string;

  @IsOptional()
  @IsString()
  purposeKey?: string;

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
}
