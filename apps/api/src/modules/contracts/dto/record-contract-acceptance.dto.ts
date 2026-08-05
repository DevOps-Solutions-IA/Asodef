import { IsOptional, IsString, IsUUID } from "class-validator";

/** ipAddress is deliberately not client-suppliable here - it's
 * acceptance evidence, always derived from the real request via
 * buildRequestContext(), never trusted from the body (a client-
 * supplied value would let the evidence be spoofed). */
export class RecordContractAcceptanceDto {
  @IsUUID()
  signerId!: string;

  @IsOptional()
  @IsString()
  evidenceReference?: string;
}
