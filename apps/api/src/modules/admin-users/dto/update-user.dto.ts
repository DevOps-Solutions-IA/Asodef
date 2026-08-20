import { IsEmail, IsISO8601, IsInt, IsOptional, IsString, Min, MinLength } from "class-validator";
import { Transform } from "class-transformer";

/**
 * Ordinary profile-field edits only (US-011 section 7) - status and role
 * changes always go through their own dedicated endpoints/operations, so
 * this DTO deliberately has no `status`/`roles` field for
 * whitelist-based ValidationPipe (forbidNonWhitelisted: true) to reject
 * outright, closing the door on silently changing them via a profile edit.
 */
export class UpdateUserDto {
  @IsOptional()
  @IsEmail({}, { message: "Ingresa un correo electrónico válido." })
  @Transform(({ value }) => (typeof value === "string" ? value.trim().toLowerCase() : value))
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(1, { message: "El nombre completo no puede estar vacío." })
  fullName?: string;

  @IsString()
  @MinLength(1, { message: "Debes indicar un motivo para este cambio." })
  reason!: string;

  /** Optimistic-concurrency guard: the client's last-known `updatedAt`.
   * When supplied and it no longer matches the current row, the update is
   * rejected as a conflict instead of silently overwriting a concurrent
   * change (US-011 section 7). */
  @IsOptional()
  @IsISO8601()
  expectedUpdatedAt?: string;

  /** Explicit monotonic CAS token. Older clients may continue sending
   * expectedUpdatedAt during the rolling rollout; the service always uses
   * the row's version internally, so even those requests are race-safe. */
  @IsOptional()
  @IsInt()
  @Min(0)
  expectedVersion?: number;
}
