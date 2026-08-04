import { IsOptional, IsString, MinLength } from "class-validator";

/**
 * "Either {documentType, documentNumber} or {reference}" (AC, verbatim).
 * All fields optional at the class-validator level - PaymentsLookupService
 * enforces "exactly one mode" itself (mirrors how the leads honeypot is
 * validated in the service, not the DTO, for a similarly non-standard
 * shape) and returns the same generic 400 either way.
 */
export class PaymentsLookupDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  documentType?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  documentNumber?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  reference?: string;
}
