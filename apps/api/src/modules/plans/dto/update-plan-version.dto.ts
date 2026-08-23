import { Type } from "class-transformer";
import { IsInt, Min, ValidateNested } from "class-validator";
import { PlanVersionContentDto } from "./plan-version-content.dto";

export class UpdatePlanVersionDto {
  @IsInt() @Min(1) expectedRevision!: number;
  @ValidateNested() @Type(() => PlanVersionContentDto) version!: PlanVersionContentDto;
}
