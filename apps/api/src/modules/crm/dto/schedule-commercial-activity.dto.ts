import { IsIn, IsISO8601, IsOptional, IsString, IsUUID } from "class-validator";
import { CommercialActivityType } from "@prisma/client";

const TYPES = Object.values(CommercialActivityType);

export class ScheduleCommercialActivityDto {
  @IsIn(TYPES, { message: `type debe ser uno de: ${TYPES.join(", ")}.` })
  type!: CommercialActivityType;

  @IsOptional()
  @IsISO8601()
  dueDate?: string;

  @IsOptional()
  @IsUUID("4")
  assignedUserId?: string;

  @IsOptional()
  @IsString()
  note?: string;
}
