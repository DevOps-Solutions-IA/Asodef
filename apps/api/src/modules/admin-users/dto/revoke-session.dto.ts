import { IsOptional, IsString, IsUUID, MinLength } from "class-validator";

export class RevokeSessionDto {
  /** Omit to revoke every session for the target user. */
  @IsOptional()
  @IsUUID()
  sessionId?: string;

  @IsString()
  @MinLength(1, { message: "Debes indicar un motivo para esta acción." })
  reason!: string;
}
