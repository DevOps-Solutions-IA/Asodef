import { IsOptional, IsUUID } from "class-validator";

export class ListRefundsQueryDto {
  @IsOptional()
  @IsUUID("4")
  paymentOrderId?: string;
}
