import { IsInt, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from "class-validator";

export class EscalateConversationDto {
  @IsInt()
  @Min(0)
  @Max(2_147_483_647)
  expectedVersion!: number;

  @IsUUID()
  idempotencyKey!: string;

  @IsString()
  @Matches(/^[A-Z][A-Z0-9_]{2,99}$/)
  reasonCode!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}
