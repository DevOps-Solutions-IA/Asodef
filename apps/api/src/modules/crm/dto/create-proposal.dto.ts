import { IsIn, IsISO8601, IsObject, IsOptional } from "class-validator";
import { ProposalStatus } from "@prisma/client";

export class CreateProposalDto {
  @IsObject()
  content!: Record<string, unknown>;

  @IsOptional()
  @IsIn(Object.values(ProposalStatus))
  status?: ProposalStatus;

  @IsOptional()
  @IsISO8601()
  sentAt?: string;
}
