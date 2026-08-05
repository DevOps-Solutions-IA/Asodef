import { IsIn, IsOptional, IsString, MinLength } from "class-validator";
import { DataSubjectRequestStatus } from "@prisma/client";

const STATUSES = Object.values(DataSubjectRequestStatus);

export class TransitionDataSubjectRequestDto {
  @IsIn(STATUSES, { message: `status debe ser uno de: ${STATUSES.join(", ")}.` })
  status!: DataSubjectRequestStatus;

  /** Required on every transition (AC: "status transitions with
   * required notes"). Stored in the AuditLog entry's metadata, not on
   * the request row itself - only the terminal resolution text (below)
   * is persisted there. */
  @IsString()
  @MinLength(1, { message: "Las notas son requeridas para cada transición de estado." })
  notes!: string;

  /** Free text, not an enum - no PRD-confirmed exhaustive value set
   * exists (see the schema's own doc comment). Recorded when this
   * transition is the one that performs identity verification. */
  @IsOptional()
  @IsString()
  identityVerificationStatus?: string;

  /** The final outcome text - only meaningful (and only ever persisted
   * to DataSubjectRequest.resolution) when status is RESOLVED or
   * REJECTED_WITH_REASON. */
  @IsOptional()
  @IsString()
  resolution?: string;
}
