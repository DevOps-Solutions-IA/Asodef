import { IsString, MinLength } from "class-validator";

export class CreateBoldPaymentDto {
  @IsString({ message: "La referencia de la orden de pago no es válida." })
  @MinLength(1, { message: "La referencia de la orden de pago no es válida." })
  reference!: string;
}
