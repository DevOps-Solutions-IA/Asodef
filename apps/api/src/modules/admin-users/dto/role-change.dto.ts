import { IsBoolean, IsOptional, IsString, MinLength } from "class-validator";

/** Shared by assign/revoke - the actual safety rules (final-SUPER_ADMIN
 * protection, self-lockout protection, SUPER_ADMIN-only authority) live
 * entirely in RoleAssignmentService (US-008); this DTO only shapes the
 * HTTP input. */
export class RoleChangeDto {
  @IsString()
  @MinLength(1, { message: "El nombre del rol es requerido." })
  roleName!: string;

  @IsString()
  @MinLength(1, { message: "Debes indicar un motivo para este cambio de gobernanza." })
  reason!: string;

  /** Validates everything and reports what *would* happen without
   * applying it - surfaced by the frontend as an impact preview before
   * the user confirms a high-risk role change. */
  @IsOptional()
  @IsBoolean()
  preview?: boolean;
}
