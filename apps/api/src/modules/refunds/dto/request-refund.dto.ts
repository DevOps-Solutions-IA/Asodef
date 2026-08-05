import { IsInt, IsPositive, IsString, MinLength } from "class-validator";

export class RequestRefundDto {
  @IsInt()
  @IsPositive()
  amountCents!: number;

  @IsString()
  @MinLength(1, { message: "El motivo del reembolso es requerido." })
  reason!: string;
}
