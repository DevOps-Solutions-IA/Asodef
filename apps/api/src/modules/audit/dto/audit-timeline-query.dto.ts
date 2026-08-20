import { Type } from "class-transformer";
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";

export enum AuditTimelineSourceFilter {
  ALL = "ALL",
  AUDIT = "AUDIT",
  SECURITY = "SECURITY",
}

export enum AuditTimelineResultFilter {
  SUCCESS = "SUCCESS",
  FAILURE = "FAILURE",
  DENIED = "DENIED",
  NO_OP = "NO_OP",
  UNKNOWN = "UNKNOWN",
}

export class AuditTimelineQueryDto {
  @IsOptional()
  @IsEnum(AuditTimelineSourceFilter)
  source: AuditTimelineSourceFilter = AuditTimelineSourceFilter.ALL;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  action?: string;

  @IsOptional()
  @IsEnum(AuditTimelineResultFilter)
  result?: AuditTimelineResultFilter;

  @IsOptional()
  @IsUUID()
  actorId?: string;

  @IsOptional()
  @IsDateString()
  @ApiPropertyOptional({ description: "Inicio inclusivo. Una fecha sin hora comienza a las 00:00:00 UTC." })
  from?: string;

  @IsOptional()
  @IsDateString()
  @ApiPropertyOptional({ description: "Fin inclusivo. Una fecha sin hora incluye el día UTC completo hasta 23:59:59.999." })
  to?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20;
}
