import { IsISO8601, IsOptional, IsString, IsUUID, MinLength } from "class-validator";

export class CreateContractDto {
  @IsString()
  @MinLength(1)
  type!: string;

  @IsOptional()
  @IsUUID()
  relatedCompanyId?: string;

  @IsOptional()
  @IsUUID()
  relatedCustomerId?: string;

  @IsString()
  @MinLength(1)
  internalReference!: string;

  @IsOptional()
  @IsISO8601()
  effectiveDate?: string;

  @IsOptional()
  @IsISO8601()
  expirationDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
