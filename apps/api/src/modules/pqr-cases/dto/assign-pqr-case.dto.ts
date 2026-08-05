import { IsString, MinLength } from "class-validator";

/** assignedTeam, not assignedUserId - matches the PqrCase schema's own
 * literal field (unlike DataSubjectRequest, which assigns to a
 * specific user). No PRD-confirmed catalog of team names exists, so
 * this stays free text rather than an invented enum. */
export class AssignPqrCaseDto {
  @IsString()
  @MinLength(1, { message: "El equipo asignado es requerido." })
  assignedTeam!: string;
}
