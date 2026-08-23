import { IsBoolean, IsISO8601, IsOptional } from "class-validator";

/** Each of the AC's 7 named gate checks, all independently settable so
 * an admin can record confirmations incrementally as they come in. */
export class UpdateBusinessPartnerChecksDto {
  @IsOptional()
  @IsBoolean()
  legalValidationConfirmed?: boolean;

  @IsOptional()
  @IsBoolean()
  commercialValidationConfirmed?: boolean;

  @IsOptional()
  @IsBoolean()
  benefitConfirmed?: boolean;

  @IsOptional()
  @IsBoolean()
  agreementValidityConfirmed?: boolean;

  @IsOptional()
  @IsBoolean()
  logoAuthorizationConfirmed?: boolean;

  @IsOptional()
  @IsBoolean()
  contactConfirmed?: boolean;

  @IsOptional()
  @IsBoolean()
  coverageConfirmed?: boolean;

  @IsOptional()
  @IsISO8601({ strict: true })
  expectedUpdatedAt?: string;
}
