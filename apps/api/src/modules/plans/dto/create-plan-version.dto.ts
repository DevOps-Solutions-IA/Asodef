import { Type } from "class-transformer";
import { ValidateNested } from "class-validator";
import { PlanVersionContentDto } from "./plan-version-content.dto";

export class CreatePlanVersionDto {
  @ValidateNested() @Type(() => PlanVersionContentDto) version!: PlanVersionContentDto;
}
