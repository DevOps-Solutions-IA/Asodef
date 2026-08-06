import { IsArray, IsISO8601, IsObject, IsOptional, IsString } from "class-validator";

export class UpdateLegalDocumentVersionDto {
  @IsOptional()
  @IsObject({ message: "El contenido del borrador debe ser un objeto." })
  draftContent?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  changeSummary?: string;

  @IsOptional()
  @IsArray({ message: "La trazabilidad de fuentes debe ser una lista." })
  sourceTraceability?: Array<Record<string, unknown>>;

  @IsOptional()
  @IsISO8601({}, { message: "La fecha de vigencia no es válida." })
  effectiveDate?: string;

  @IsOptional()
  @IsISO8601({}, { message: "La fecha de expiración no es válida." })
  expirationDate?: string;
}
