import { IsEmail, IsISO8601, IsObject, IsOptional, IsString, IsUUID, MinLength } from "class-validator";

export class CreateBusinessPartnerDto {
  @IsString()
  @MinLength(1)
  legalName!: string;

  @IsString()
  @MinLength(1)
  tradeName!: string;

  @IsString()
  @MinLength(1)
  nit!: string;

  @IsString()
  @MinLength(1)
  sector!: string;

  @IsString()
  @MinLength(1)
  city!: string;

  @IsString()
  @MinLength(1)
  address!: string;

  @IsString()
  @MinLength(1)
  phone!: string;

  @IsEmail()
  corporateEmail!: string;

  @IsOptional()
  @IsString()
  website?: string;

  // Nullable/unconfirmed per PRD dataModel - never required.
  @IsOptional()
  @IsString()
  legalRepresentative?: string;

  @IsOptional()
  @IsUUID()
  commercialContactId?: string;

  @IsString()
  @MinLength(1)
  agreementType!: string;

  @IsObject()
  benefitsOffered!: Record<string, unknown>;

  @IsOptional()
  @IsString()
  discountConditions?: string;

  @IsOptional()
  @IsString()
  geographicCoverage?: string;

  @IsOptional()
  @IsISO8601()
  validFrom?: string;

  @IsOptional()
  @IsISO8601()
  validUntil?: string;

  @IsOptional()
  @IsString()
  logoPath?: string;

  @IsOptional()
  @IsString()
  internalNotes?: string;
}
