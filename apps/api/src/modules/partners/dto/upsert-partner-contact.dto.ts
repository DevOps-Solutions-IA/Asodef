import { IsEmail, IsISO8601, IsOptional, IsString, MaxLength, ValidateIf } from "class-validator";

export class UpsertPartnerContactDto {
  @IsString() @MaxLength(120) fullName!: string;
  @IsOptional() @IsString() @MaxLength(80) role?: string;
  @ValidateIf((object: UpsertPartnerContactDto) => !object.email) @IsString() @MaxLength(40) phone?: string;
  @ValidateIf((object: UpsertPartnerContactDto) => !object.phone) @IsEmail() @MaxLength(160) email?: string;
  @IsISO8601({ strict: true }) expectedUpdatedAt!: string;
}
