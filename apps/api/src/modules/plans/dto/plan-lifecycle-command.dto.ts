import { IsInt, IsNotEmpty, IsString, Min } from "class-validator";

export class PlanLifecycleCommandDto {
  @IsInt() @Min(1) expectedRevision!: number;
  @IsString() @IsNotEmpty() reason!: string;
}
