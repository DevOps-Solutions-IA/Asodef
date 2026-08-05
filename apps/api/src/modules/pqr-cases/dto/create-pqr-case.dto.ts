import { IsOptional, IsString, MinLength } from "class-validator";

/**
 * relatedPaymentOrderId is never accepted directly from a public,
 * unauthenticated caller (that would let anyone claim a link to any
 * order) - only its safe public reference, resolved server-side. No
 * customerId is accepted at all; if the reference resolves, the
 * linked order's own customer is used automatically (PqrCasesService).
 */
export class CreatePqrCaseDto {
  @IsString()
  @MinLength(1, { message: "La categoría es requerida." })
  category!: string;

  @IsString()
  @MinLength(1, { message: "El nombre es requerido." })
  applicantName!: string;

  @IsString()
  @MinLength(1, { message: "El contacto (correo o teléfono) es requerido." })
  applicantContact!: string;

  @IsString()
  @MinLength(1, { message: "La descripción es requerida." })
  description!: string;

  @IsOptional()
  @IsString()
  paymentReference?: string;
}
