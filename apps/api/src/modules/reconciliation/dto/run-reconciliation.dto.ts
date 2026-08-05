import { IsISO8601, IsOptional, IsString } from "class-validator";

export class RunReconciliationDto {
  @IsISO8601()
  rangeStart!: string;

  @IsISO8601()
  rangeEnd!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
