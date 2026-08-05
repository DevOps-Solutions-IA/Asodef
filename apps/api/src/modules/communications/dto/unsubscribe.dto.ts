import { IsOptional, IsString, MinLength } from "class-validator";

export class UnsubscribeDto {
  @IsString()
  @MinLength(1)
  channel!: string;

  @IsString()
  @MinLength(1)
  recipient!: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
