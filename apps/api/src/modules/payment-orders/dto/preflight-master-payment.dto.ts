import { IsString, MinLength } from "class-validator";

/** Opaque selector emitted by /payments/lookup for a Master obligation. */
export class PreflightMasterPaymentDto {
  @IsString()
  @MinLength(1)
  selectionToken!: string;
}
