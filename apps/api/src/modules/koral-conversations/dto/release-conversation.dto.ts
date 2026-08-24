import { IsInt, IsString, IsUUID, Max, MaxLength, Min, MinLength } from "class-validator";

export class ReleaseConversationDto {
  @IsInt()
  @Min(0)
  @Max(2_147_483_647)
  expectedVersion!: number;

  @IsUUID()
  idempotencyKey!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}
