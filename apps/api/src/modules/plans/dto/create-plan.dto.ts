import { IsNotEmpty, IsString, Matches, MaxLength, ValidateNested } from "class-validator";
import { Type } from "class-transformer";
import { PlanVersionContentDto } from "./plan-version-content.dto";

export class CreatePlanDto {
  @IsString() @Matches(/^[A-Z][A-Z0-9_]{2,63}$/) code!: string;
  @IsString() @IsNotEmpty() @MaxLength(200) name!: string;
  @ValidateNested() @Type(() => PlanVersionContentDto) version!: PlanVersionContentDto;
}
