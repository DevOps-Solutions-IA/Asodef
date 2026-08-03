import { IsEmail } from "class-validator";
import { Transform } from "class-transformer";

export class ForgotPasswordDto {
  @IsEmail({}, { message: "Ingresa un correo electrónico válido." })
  @Transform(({ value }) => (typeof value === "string" ? value.trim().toLowerCase() : value))
  email!: string;
}
