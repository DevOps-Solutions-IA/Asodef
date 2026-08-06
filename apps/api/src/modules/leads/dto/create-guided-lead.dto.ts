import { Transform, Type } from "class-transformer";
import { Equals, IsBoolean, IsEmail, IsIn, IsObject, IsOptional, IsString, MaxLength, MinLength, ValidateNested } from "class-validator";

class CampaignDto {
  @IsOptional() @IsString() @MaxLength(160) utmSource?: string;
  @IsOptional() @IsString() @MaxLength(160) utmMedium?: string;
  @IsOptional() @IsString() @MaxLength(160) utmCampaign?: string;
  @IsOptional() @IsString() @MaxLength(160) utmTerm?: string;
  @IsOptional() @IsString() @MaxLength(160) utmContent?: string;
}

export class CreateGuidedLeadDto {
  @IsString() @IsIn(["person", "affiliate", "company", "ally", "orientation"])
  audience!: "person" | "affiliate" | "company" | "ally" | "orientation";

  @IsString() @MinLength(2) @MaxLength(120) need!: string;
  @IsString() @MinLength(2) @MaxLength(160) fullName!: string;
  @IsEmail() @Transform(({ value }) => typeof value === "string" ? value.trim().toLowerCase() : value) email!: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsString() @MaxLength(160) company?: string;
  @IsOptional() @IsString() @MaxLength(80) taxId?: string;
  @IsOptional() @IsString() @MaxLength(120) role?: string;
  @IsOptional() @IsString() @MaxLength(120) city?: string;
  @IsString() @MinLength(4) @MaxLength(1200) message!: string;
  @IsString() @IsIn(["email", "whatsapp", "phone"]) preferredContact!: "email" | "whatsapp" | "phone";
  @Equals(true, { message: "Debes autorizar el tratamiento de datos para continuar." }) dataProcessingConsent!: true;
  @IsOptional() @IsBoolean() commercialConsent?: boolean;
  @IsOptional() @IsBoolean() emailConsent?: boolean;
  @IsOptional() @IsBoolean() whatsappConsent?: boolean;
  @IsString() @MinLength(16) @MaxLength(100) idempotencyKey!: string;
  @IsString() @MaxLength(240) entryRoute!: string;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => CampaignDto) campaign?: CampaignDto;
  @IsOptional() @IsString() website?: string;
}
