import { IsISO8601, IsOptional, IsString, IsUUID } from "class-validator";

export class CreateAgreementDto {
  @IsUUID()
  companyId!: string;

  // No PRD-given enum for Agreement.status - free-form, optional.
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsISO8601()
  signedDate?: string;
}
