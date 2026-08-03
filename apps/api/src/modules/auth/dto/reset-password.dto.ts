import { IsString, MinLength, MaxLength, Matches } from "class-validator";
import { Match } from "../decorators/match.decorator";

export class ResetPasswordDto {
  @IsString()
  @MinLength(20, { message: "Token de restablecimiento inválido o expirado." })
  @Matches(/^[A-Za-z0-9_-]+$/, { message: "Token de restablecimiento inválido o expirado." })
  token!: string;

  // Deliberately not validated with @MinLength/@MaxLength here -
  // PasswordPolicyService owns the real policy (min/max length, common-
  // password, history reuse) so there is exactly one source of truth for
  // what a valid password is. This decorator only guards against
  // missing/non-string input reaching the service at all.
  @IsString()
  @MaxLength(1024, { message: "La contraseña es demasiado larga." })
  newPassword!: string;

  @IsString()
  @Match("newPassword")
  confirmPassword!: string;
}
