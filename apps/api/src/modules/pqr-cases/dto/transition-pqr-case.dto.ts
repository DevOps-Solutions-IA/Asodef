import { IsIn, IsInt, IsOptional, IsString, Min, MinLength } from "class-validator";
import { PqrCaseStatus } from "@prisma/client";

const STATUSES = Object.values(PqrCaseStatus);

export class TransitionPqrCaseDto {
  @IsIn(STATUSES, { message: `status debe ser uno de: ${STATUSES.join(", ")}.` })
  status!: PqrCaseStatus;

  /** Required on every transition, same convention as
   * DataSubjectRequest's transition DTO. */
  @IsString()
  @MinLength(1, { message: "Las notas son requeridas para cada transición de estado." })
  notes!: string;

  /** Only meaningful (and only ever persisted to PqrCase.resolution)
   * when transitioning to RESOLVED or CLOSED - CLOSED specifically
   * requires a resolution to already exist or be given here (AC's own
   * negative case). */
  @IsOptional()
  @IsString()
  resolution?: string;

  /** No PRD-confirmed scale exists for this (e.g. 1-5, 1-10, NPS) -
   * validated only as a plain non-negative integer, no invented upper
   * bound. */
  @IsOptional()
  @IsInt()
  @Min(0)
  satisfactionScore?: number;
}
