import { Equals, IsEmail, IsOptional, IsString, MinLength } from "class-validator";
import { Transform } from "class-transformer";

export class CreateLeadDto {
  @IsString()
  @MinLength(1, { message: "El nombre completo es requerido." })
  nombreCompleto!: string;

  @IsString()
  @MinLength(1, { message: "La empresa es requerida." })
  empresa!: string;

  @IsString()
  @MinLength(1, { message: "El cargo es requerido." })
  cargo!: string;

  @IsString()
  @MinLength(1, { message: "La ciudad es requerida." })
  ciudad!: string;

  @IsString()
  @MinLength(1, { message: "El teléfono/WhatsApp es requerido." })
  telefono!: string;

  @IsEmail({}, { message: "Ingresa un correo electrónico válido." })
  @Transform(({ value }) => (typeof value === "string" ? value.trim().toLowerCase() : value))
  correo!: string;

  @IsString()
  @MinLength(1, { message: "El sector es requerido." })
  sector!: string;

  @IsString()
  @MinLength(1, { message: "El mensaje es requerido." })
  mensaje!: string;

  /** Must be exactly `true` - per the acceptance criteria, submitting
   * without consentAccepted=true (including an explicit `false`) is
   * rejected, not merely "any boolean accepted". */
  @Equals(true, { message: "Debes aceptar el tratamiento de datos para continuar." })
  consentAccepted!: true;

  /** Honeypot: a real visitor never fills this hidden field. Any
   * non-empty value marks the submission as bot traffic - see
   * LeadsService.create, which accepts (201) but silently drops it
   * rather than signaling detection back to the bot. */
  @IsOptional()
  @IsString()
  website?: string;
}
