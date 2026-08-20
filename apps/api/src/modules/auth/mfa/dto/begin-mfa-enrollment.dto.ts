import { IsString, MinLength } from "class-validator";

export class BeginMfaEnrollmentDto {
  @IsString()
  @MinLength(12)
  password!: string;
}
