import { IsIn, IsInt, IsOptional, Max, Min } from "class-validator";
import { Type } from "class-transformer";
import { DataSubjectRequestStatus } from "@prisma/client";

const STATUSES = Object.values(DataSubjectRequestStatus);

export class ListDataSubjectRequestsQueryDto {
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
  @IsIn(STATUSES)
  status?: DataSubjectRequestStatus;
}
