import { ConversationPriority } from "@prisma/client";
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from "class-validator";

export class AssignConversationDto {
  @IsUUID()
  assigneeUserId!: string;

  @IsEnum(ConversationPriority)
  priority!: ConversationPriority;

  @IsInt()
  @Min(0)
  @Max(2_147_483_647)
  expectedVersion!: number;

  @IsUUID()
  idempotencyKey!: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason?: string;
}
