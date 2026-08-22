import { IsString, IsUUID, MaxLength, MinLength } from "class-validator";

export class AddInternalNoteDto {
  @IsString()
  @MinLength(1)
  @MaxLength(10_000)
  body!: string;

  @IsUUID()
  idempotencyKey!: string;
}
