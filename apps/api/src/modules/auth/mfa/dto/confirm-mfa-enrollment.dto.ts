import { IsString, Matches, MinLength } from "class-validator";

export class ConfirmMfaEnrollmentDto {
  @IsString()
  @MinLength(12)
  password!: string;

  @IsString()
  @Matches(/^\d{6}$/)
  code!: string;
}
