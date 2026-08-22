import { IsBoolean, IsOptional, IsString, MaxLength } from "class-validator";

export class CreateCompanySiteDto {
  @IsString() @MaxLength(120) name!: string;
  @IsString() @MaxLength(200) address!: string;
  @IsString() @MaxLength(100) city!: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsBoolean() isPrimary?: boolean;
}
