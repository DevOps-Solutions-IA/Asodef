import { IsUUID } from "class-validator";

export class CreatePaymentOrderDto {
  @IsUUID("4", { message: "El identificador de la obligación no es válido." })
  obligationId!: string;
}
