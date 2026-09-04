import { IsString, MinLength } from "class-validator";

export class CreateMasterPaymentOrderDto {
  @IsString()
  @MinLength(32)
  selectionToken!: string;
}
