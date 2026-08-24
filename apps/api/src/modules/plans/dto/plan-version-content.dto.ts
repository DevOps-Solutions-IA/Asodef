import { Type } from "class-transformer";
import { IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsNotEmpty, IsObject, IsOptional, IsString, Length, MaxLength, Min } from "class-validator";
import { PLAN_BILLING_PERIODS } from "@asodef/connect-contracts";

export class PlanPricingDto {
  @IsInt()
  @Min(0)
  amountMinor!: number;

  @IsString()
  @Length(3, 3)
  currency!: string;
}

export class PlanVisibilityDto {
  @IsBoolean() public!: boolean;
  @IsBoolean() koral!: boolean;
  @IsBoolean() crm!: boolean;
  @IsBoolean() contracts!: boolean;
}

export class PlanVersionContentDto {
  @IsString() @IsNotEmpty() @MaxLength(200) internalName!: string;
  @IsString() @IsNotEmpty() @MaxLength(200) name!: string;
  @IsString() @IsNotEmpty() description!: string;
  @IsArray() features!: unknown[];
  @IsArray() benefits!: unknown[];
  @IsOptional() @IsString() eligibility?: string;
  @IsObject() @Type(() => PlanPricingDto) pricing!: PlanPricingDto;
  @IsString() @IsIn(PLAN_BILLING_PERIODS) billingPeriod!: string;
  @IsOptional() @IsString() commercialText?: string;
  @IsOptional() @IsString() terms?: string;
  @IsObject() @Type(() => PlanVisibilityDto) visibility!: PlanVisibilityDto;
  @IsBoolean() recommended!: boolean;
  @IsInt() @Min(0) displayOrder!: number;
  @IsOptional() @IsDateString() effectiveFrom?: string;
  @IsOptional() @IsDateString() effectiveTo?: string;
  @IsOptional() @IsString() coverage?: string;
  @IsOptional() @IsArray() exclusions?: unknown[];
  @IsOptional() @IsString() beneficiaryRules?: string;
  @IsOptional() @IsString() taxes?: string;
  @IsOptional() @IsString() cancellationRules?: string;
  @IsOptional() @IsString() renewalRules?: string;
  @IsOptional() @IsString() paymentConditions?: string;
}
