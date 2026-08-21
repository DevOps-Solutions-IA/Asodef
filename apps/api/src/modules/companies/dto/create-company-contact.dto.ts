import { IsBoolean, IsEmail, IsOptional, IsString, MaxLength, ValidateIf } from "class-validator";

export class CreateCompanyContactDto {
  @IsString() @MaxLength(120) fullName!: string;
  @IsOptional() @IsString() @MaxLength(80) role?: string;
  @ValidateIf((object: CreateCompanyContactDto) => !object.email) @IsString() @MaxLength(40) phone?: string;
  @ValidateIf((object: CreateCompanyContactDto) => !object.phone) @IsEmail() @MaxLength(160) email?: string;
  @IsOptional() @IsBoolean() isPrimary?: boolean;
}
