import { IsISO8601, IsOptional } from "class-validator";

export class PublishBusinessPartnerDto {
  @IsOptional()
  @IsISO8601({ strict: true })
  expectedUpdatedAt?: string;
}
