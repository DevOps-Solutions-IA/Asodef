import { IsString, Matches, MinLength } from "class-validator";

export class VerifyMfaLoginDto {
  @IsString()
  @MinLength(32)
  challengeToken!: string;

  @IsString()
  @Matches(/^(?:\d{6}|[A-Z0-9]{4}(?:-[A-Z0-9]{4}){2})$/i)
  code!: string;
}
