import { ArrayUnique, IsArray, IsEmail, IsOptional, IsString, MinLength } from "class-validator";
import { Transform } from "class-transformer";

export class CreateUserDto {
  @IsEmail({}, { message: "Ingresa un correo electrónico válido." })
  @Transform(({ value }) => (typeof value === "string" ? value.trim().toLowerCase() : value))
  email!: string;

  @IsString()
  @MinLength(1, { message: "El nombre completo es requerido." })
  fullName!: string;

  /** Only ever applied via RoleAssignmentService, which itself requires
   * the acting actor to hold SUPER_ADMIN (US-011 section 6: "prevent
   * unauthorized privileged-role creation") - an ordinary ADMIN supplying
   * this field is rejected before any write happens. */
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  roles?: string[];
}
