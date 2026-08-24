import { ConversationStatus } from "@prisma/client";
import { IsIn, IsInt, IsString, IsUUID, Max, MaxLength, Min, MinLength } from "class-validator";

export const OPERATOR_TRANSITION_TARGETS = [
  ConversationStatus.AI_ACTIVE,
  ConversationStatus.WAITING_INTERNAL,
  ConversationStatus.RESOLVED,
  ConversationStatus.CLOSED,
] as const;

export class TransitionConversationDto {
  @IsIn(OPERATOR_TRANSITION_TARGETS)
  targetStatus!: (typeof OPERATOR_TRANSITION_TARGETS)[number];

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
