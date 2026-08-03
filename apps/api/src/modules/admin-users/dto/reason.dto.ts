import { IsString, MinLength } from "class-validator";

/** Shared by deactivate/reactivate/unlock - each a distinct explicit
 * operation (US-011 section 7: "role changes, activation and security
 * actions must use separate explicit operations"), all requiring the same
 * single `reason` field. */
export class ReasonDto {
  @IsString()
  @MinLength(1, { message: "Debes indicar un motivo para esta acción." })
  reason!: string;
}
