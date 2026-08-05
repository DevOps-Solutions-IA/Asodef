import { IsIn, IsOptional, IsString, IsUUID, MinLength } from "class-validator";
import { ProspectType } from "@prisma/client";

const PROSPECT_TYPES = Object.values(ProspectType);

/** LeadSubmission never collects a document/NIT number or a
 * type (individual vs company) - those are required explicit input
 * here rather than guessed at. Everything else defaults from the
 * lead's own data if not overridden. */
export class PromoteLeadDto {
  @IsIn(PROSPECT_TYPES, { message: `type debe ser uno de: ${PROSPECT_TYPES.join(", ")}.` })
  type!: ProspectType;

  @IsString()
  @MinLength(1, { message: "El documento o NIT es requerido." })
  documentOrNit!: string;

  @IsOptional()
  @IsString()
  fullNameOrLegalName?: string;

  @IsOptional()
  @IsString()
  sector?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsUUID("4")
  assignedUserId?: string;
}
