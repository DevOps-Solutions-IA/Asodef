import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
  Validate,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
  type ValidationArguments,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  BINGO_ELIGIBILITY_POLICIES,
  BINGO_EVENT_VISIBILITIES,
  BINGO_FAIRNESS_MODES,
  BINGO_PARTICIPANT_KINDS,
  BINGO_PATTERN_KINDS,
  BINGO_PRIZE_KINDS,
  BINGO_TIE_POLICIES,
  BINGO_VALIDATION_POLICIES,
  BINGO_WINNER_VISIBILITIES,
  type BingoEligibilityPolicyContract,
  type BingoEventVisibilityContract,
  type BingoFairnessModeContract,
  type BingoParticipantKindContract,
  type BingoPatternKindContract,
  type BingoPrizeKindContract,
  type BingoTiePolicyContract,
  type BingoValidationPolicyContract,
  type BingoWinnerVisibilityContract,
} from "../common";

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MONEY = /^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/;

@ValidatorConstraint({ name: "bingoParticipantReference", async: false })
class BingoParticipantReferenceConstraint implements ValidatorConstraintInterface {
  validate(_kind: unknown, arguments_: ValidationArguments): boolean {
    const value = arguments_.object as RegisterBingoParticipantDto;
    const has = (field: keyof RegisterBingoParticipantDto) =>
      typeof value[field] === "string" && value[field]!.length > 0;
    switch (value.kind) {
      case "AFFILIATE":
        return (
          has("affiliateId") &&
          !has("beneficiarySourceId") &&
          !has("companyId") &&
          !has("authorizedSubjectRef")
        );
      case "BENEFICIARY":
        return (
          has("beneficiarySourceId") &&
          !has("affiliateId") &&
          !has("companyId") &&
          !has("authorizedSubjectRef")
        );
      case "PARTNER_COMPANY_MEMBER":
        return (
          has("companyId") &&
          has("authorizedSubjectRef") &&
          !has("affiliateId") &&
          !has("beneficiarySourceId")
        );
      case "AUTHORIZED_GUEST":
        return (
          has("authorizedSubjectRef") &&
          !has("affiliateId") &&
          !has("beneficiarySourceId") &&
          !has("companyId")
        );
      default:
        return false;
    }
  }

  defaultMessage(): string {
    return "La referencia de identidad no corresponde al tipo de participante.";
  }
}

export class CreateBingoEventDto {
  @ApiProperty({ example: "bingo-asodef-2026" })
  @IsString()
  @Matches(SLUG)
  @MaxLength(120)
  slug!: string;
  @ApiProperty({ maxLength: 160 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name!: string;
  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
  @ApiProperty({ enum: BINGO_EVENT_VISIBILITIES })
  @IsIn(BINGO_EVENT_VISIBILITIES)
  visibility!: BingoEventVisibilityContract;
  @ApiProperty({ enum: BINGO_ELIGIBILITY_POLICIES })
  @IsIn(BINGO_ELIGIBILITY_POLICIES)
  eligibilityPolicy!: BingoEligibilityPolicyContract;
  @ApiProperty({ minimum: 1, maximum: 100 })
  @IsInt()
  @Min(1)
  @Max(100)
  maxCardsPerParticipant!: number;
  @ApiProperty({ enum: BINGO_WINNER_VISIBILITIES })
  @IsIn(BINGO_WINNER_VISIBILITIES)
  publicWinnerVisibility!: BingoWinnerVisibilityContract;
  @ApiProperty({ enum: BINGO_VALIDATION_POLICIES })
  @IsIn(BINGO_VALIDATION_POLICIES)
  validationPolicy!: BingoValidationPolicyContract;
  @ApiProperty({ enum: BINGO_FAIRNESS_MODES })
  @IsIn(BINGO_FAIRNESS_MODES)
  fairnessMode!: BingoFairnessModeContract;
  @ApiProperty({ format: "date-time" })
  @IsISO8601({ strict: true })
  startsAt!: string;
  @ApiPropertyOptional({ format: "date-time" })
  @IsOptional()
  @IsISO8601({ strict: true })
  endsAt?: string;
}

export class UpdateBingoEventDto {
  @ApiPropertyOptional({ maxLength: 160 })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name?: string;
  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
  @ApiPropertyOptional({ enum: BINGO_EVENT_VISIBILITIES })
  @IsOptional()
  @IsIn(BINGO_EVENT_VISIBILITIES)
  visibility?: BingoEventVisibilityContract;
  @ApiPropertyOptional({ enum: BINGO_ELIGIBILITY_POLICIES })
  @IsOptional()
  @IsIn(BINGO_ELIGIBILITY_POLICIES)
  eligibilityPolicy?: BingoEligibilityPolicyContract;
  @ApiPropertyOptional({ minimum: 1, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  maxCardsPerParticipant?: number;
  @ApiPropertyOptional({ enum: BINGO_WINNER_VISIBILITIES })
  @IsOptional()
  @IsIn(BINGO_WINNER_VISIBILITIES)
  publicWinnerVisibility?: BingoWinnerVisibilityContract;
  @ApiPropertyOptional({ enum: BINGO_VALIDATION_POLICIES })
  @IsOptional()
  @IsIn(BINGO_VALIDATION_POLICIES)
  validationPolicy?: BingoValidationPolicyContract;
  @ApiPropertyOptional({ format: "date-time" })
  @IsOptional()
  @IsISO8601({ strict: true })
  startsAt?: string;
  @ApiPropertyOptional({ format: "date-time" })
  @IsOptional()
  @IsISO8601({ strict: true })
  endsAt?: string;
}

export class CreateBingoRoundDto {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) order!: number;
  @ApiProperty({ maxLength: 160 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name!: string;
  @ApiProperty({ enum: BINGO_TIE_POLICIES })
  @IsIn(BINGO_TIE_POLICIES)
  tiePolicy!: BingoTiePolicyContract;
  @ApiProperty({ enum: BINGO_VALIDATION_POLICIES })
  @IsIn(BINGO_VALIDATION_POLICIES)
  validationPolicy!: BingoValidationPolicyContract;
  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @Matches(SLUG)
  @MaxLength(120)
  specialTieRuleRef?: string;
}

export class BingoPatternMaskDto {
  @ApiProperty({ type: [Number], minimum: 0, maximum: 24 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(25)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(24, { each: true })
  positions!: number[];
}

export class CreateBingoPatternDto {
  @ApiProperty({ maxLength: 120 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;
  @ApiProperty({ enum: BINGO_PATTERN_KINDS })
  @IsIn(BINGO_PATTERN_KINDS)
  kind!: BingoPatternKindContract;
  @ApiProperty({ type: [BingoPatternMaskDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(32)
  @ValidateNested({ each: true })
  @Type(() => BingoPatternMaskDto)
  masks!: BingoPatternMaskDto[];
  @ApiPropertyOptional() @IsOptional() @IsBoolean() includeFreeCenter?: boolean;
}

export class CreateBingoPrizeDto {
  @ApiProperty({ enum: BINGO_PRIZE_KINDS })
  @IsIn(BINGO_PRIZE_KINDS)
  kind!: BingoPrizeKindContract;
  @ApiProperty({ maxLength: 160 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name!: string;
  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
  @ApiPropertyOptional({
    example: "1500000.00",
    description: "Exact decimal string; never a float.",
  })
  @IsOptional()
  @IsString()
  @Matches(MONEY)
  monetaryAmount?: string;
  @ApiPropertyOptional({ example: "COP" })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency?: string;
}

export class RegisterBingoParticipantDto {
  @ApiProperty({ enum: BINGO_PARTICIPANT_KINDS })
  @IsIn(BINGO_PARTICIPANT_KINDS)
  @Validate(BingoParticipantReferenceConstraint)
  kind!: BingoParticipantKindContract;
  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  affiliateId?: string;
  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  beneficiarySourceId?: string;
  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  companyId?: string;
  @ApiPropertyOptional({
    description: "Opaque authorized reference; never document/phone/email.",
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  authorizedSubjectRef?: string;
  @ApiPropertyOptional({ maxLength: 300 })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  approvalReference?: string;
}

export class GenerateBingoCardsDto {
  @ApiProperty({ minimum: 1, maximum: 50000 })
  @IsInt()
  @Min(1)
  @Max(50_000)
  count!: number;
}

export class AssignBingoCardDto {
  @ApiProperty({ format: "uuid" }) @IsUUID() participantId!: string;
  @ApiProperty({ maxLength: 500 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}

export class ExecutionReasonDto {
  @ApiProperty({ minLength: 3, maxLength: 500 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}

export class CandidateDecisionDto {
  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class ConfirmWinnerDto {
  @ApiProperty({ format: "uuid" }) @IsUUID() prizeId!: string;
  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @Matches(SLUG)
  @MaxLength(120)
  specialRuleRef?: string;
}
