import { IsNotEmpty, IsObject, IsString, Matches } from "class-validator";

export class CreateLegalDocumentDto {
  @IsString()
  @IsNotEmpty({ message: "El tipo de documento es requerido." })
  type!: string;

  @IsString()
  @IsNotEmpty({ message: "El título es requerido." })
  title!: string;

  @Matches(/^[a-z0-9-]+$/, { message: "El slug solo puede contener minúsculas, números y guiones." })
  slug!: string;

  @IsObject({ message: "El contenido del borrador debe ser un objeto." })
  draftContent!: Record<string, unknown>;
}
