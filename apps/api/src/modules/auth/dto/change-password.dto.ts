import { IsString, MinLength, MaxLength } from "class-validator";
import { Match } from "../decorators/match.decorator";

export class ChangePasswordDto {
  @IsString()
  @MinLength(1, { message: "La contraseña actual es requerida." })
  currentPassword!: string;

  // See ResetPasswordDto: PasswordPolicyService owns the real policy.
  @IsString()
  @MaxLength(1024, { message: "La contraseña es demasiado larga." })
  newPassword!: string;

  @IsString()
  @Match("newPassword")
  confirmPassword!: string;
}
