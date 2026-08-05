import { IsIn, IsISO8601, IsOptional, IsString } from "class-validator";
import { ApprovalGateStatus } from "@prisma/client";

export class TransitionApprovalGateDto {
  @IsIn(Object.values(ApprovalGateStatus))
  status!: ApprovalGateStatus;

  // AC: "each requiring approver, date, and optional supporting
  // document/notes" - approver is always the authenticated actor
  // (@CurrentUser), never client-suppliable; date defaults to now()
  // when transitioning to APPROVED/REJECTED if not explicitly given.
  @IsOptional()
  @IsISO8601()
  date?: string;

  @IsOptional()
  @IsString()
  supportingDocumentPath?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsISO8601()
  expirationDate?: string;
}
