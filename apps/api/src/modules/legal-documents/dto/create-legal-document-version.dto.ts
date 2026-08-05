import { IsISO8601, IsObject, IsOptional, IsString } from "class-validator";

export class CreateLegalDocumentVersionDto {
  @IsObject({ message: "El contenido del borrador debe ser un objeto." })
  draftContent!: Record<string, unknown>;

  @IsOptional()
  @IsString()
  changeSummary?: string;

  @IsOptional()
  @IsISO8601({}, { message: "La fecha de vigencia no es válida." })
  effectiveDate?: string;

  @IsOptional()
  @IsISO8601({}, { message: "La fecha de expiración no es válida." })
  expirationDate?: string;
}
