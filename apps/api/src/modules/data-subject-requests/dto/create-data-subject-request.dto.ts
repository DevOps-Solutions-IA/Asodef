import { IsEmail, IsIn, IsString, MinLength } from "class-validator";
import { Transform } from "class-transformer";
import { DataSubjectRequestType } from "@prisma/client";

const REQUEST_TYPES = Object.values(DataSubjectRequestType);

export class CreateDataSubjectRequestDto {
  @IsIn(REQUEST_TYPES, { message: `type debe ser uno de: ${REQUEST_TYPES.join(", ")}.` })
  type!: DataSubjectRequestType;

  @IsString()
  @MinLength(1, { message: "El nombre es requerido." })
  requesterName!: string;

  @IsEmail({}, { message: "Ingresa un correo electrónico válido." })
  @Transform(({ value }) => (typeof value === "string" ? value.trim().toLowerCase() : value))
  requesterEmail!: string;

  @IsString()
  @MinLength(1, { message: "El número de documento es requerido." })
  requesterDocument!: string;

  @IsString()
  @MinLength(1, { message: "La descripción de la solicitud es requerida." })
  description!: string;
}
