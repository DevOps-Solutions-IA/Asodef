import { IsString, MinLength } from "class-validator";

export class ResolveDifferenceDto {
  @IsString()
  @MinLength(1, { message: "Las notas de resolución son requeridas." })
  resolutionNotes!: string;
}
