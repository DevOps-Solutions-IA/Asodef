import { IsBoolean, IsEmail, IsIn, IsObject, IsOptional, IsString, IsUUID, Length, Matches, MaxLength, MinLength, ValidateIf } from "class-validator";
import type { AffiliateDocumentType, AffiliateIdentifierMode } from "./external-core.provider";

export class AffiliateAccessStartDto {
  @IsIn(["TITULAR_NUMBER", "DOCUMENT"] satisfies AffiliateIdentifierMode[]) identifierMode!: AffiliateIdentifierMode;
  @ValidateIf((dto: AffiliateAccessStartDto) => dto.identifierMode === "DOCUMENT")
  @IsIn(["CC", "CE", "TI", "PA", "PPT"] satisfies AffiliateDocumentType[])
  documentType?: AffiliateDocumentType;
  @IsString() @Length(4, 40) @Matches(/^[A-Za-z0-9][A-Za-z0-9 .-]*$/) identifier!: string;
}

export class CompanyAccessStartDto {
  @IsString() @Length(5, 30) @Matches(/^[0-9.-]+$/) nit!: string;
}

export class AccessRequestCodeDto {
  @IsUUID() providerReference!: string;
  @IsString() @Length(1, 100) channelReference!: string;
}

export class AccessResendDto {
  @IsUUID() challengeId!: string;
}

export class AccessVerifyDto {
  @IsUUID() challengeId!: string;
  @IsString() @Matches(/^\d{6}$/) code!: string;
}

export class ContactUpdateStartDto {
  @IsIn(["email", "sms", "whatsapp"]) channel!: "email" | "sms" | "whatsapp";
  @IsString() @Length(5, 254) newDestination!: string;
}

export class ContactUpdateRequestCodeDto {
  @IsUUID() requestId!: string;
}

export class ContactUpdateVerifyDto extends ContactUpdateRequestCodeDto {
  @IsString() @Matches(/^\d{6}$/) code!: string;
}

export class ProviderMutationDto {
  @IsObject() payload!: Record<string, unknown>;
}

export class BeneficiaryDocumentDto {
  @IsString() @MinLength(1) @MaxLength(80) documentType!: string;
}

export class PaymentOperationDto {
  @IsObject() payload!: Record<string, unknown>;
  @IsOptional() @IsString() @MaxLength(100) applicationId?: string;
  @IsOptional() @IsBoolean() confirmed?: boolean;
  @IsOptional() @IsEmail() notificationEmail?: string;
}
